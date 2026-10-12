import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import type { UserService } from '../../application/user-service.ts';
import type { UserData } from '../../domain/user.ts';

const userDataSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.email().max(254),
  })
  .strict();

function logInvalidUserData(request: Request, issues: z.ZodIssue[]): void {
  request.log.warn(
    {
      validationIssues: issues.map(({ code, path }) => ({
        code,
        path: path.join('.'),
      })),
    },
    'User data validation failed',
  );
}

function parseUserData(
  request: Request,
  response: Response,
): UserData | undefined {
  const result = userDataSchema.safeParse(request.body);

  if (result.success) {
    return result.data;
  }

  logInvalidUserData(request, result.error.issues);
  response.status(400).json({ error: 'Invalid request body' });
  return undefined;
}

function getUserId(request: Request): string {
  const userId = request.params.id;
  return Array.isArray(userId) ? (userId[0] ?? '') : (userId ?? '');
}

export function createUserRouter(userService: UserService): Router {
  const router = Router();

  async function listUsers(_request: Request, response: Response) {
    response.json(await userService.listUsers());
  }

  async function getUser(request: Request, response: Response) {
    const user = await userService.getUser(getUserId(request));
    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }

    response.json(user);
  }

  async function createUser(request: Request, response: Response) {
    const userData = parseUserData(request, response);
    if (!userData) {
      return;
    }

    const user = await userService.createUser(userData);
    response.status(201).json(user);
  }

  async function updateUser(request: Request, response: Response) {
    const userData = parseUserData(request, response);
    if (!userData) {
      return;
    }

    const user = await userService.updateUser(getUserId(request), userData);
    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }

    response.json(user);
  }

  async function deleteUser(request: Request, response: Response) {
    const deleted = await userService.deleteUser(getUserId(request));
    if (!deleted) {
      response.status(404).json({ error: 'User not found' });
      return;
    }

    response.status(204).send();
  }

  router.get('/', listUsers);
  router.get('/:id', getUser);
  router.post('/', createUser);
  router.put('/:id', updateUser);
  router.delete('/:id', deleteUser);

  return router;
}
