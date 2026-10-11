import { Router } from 'express';
import { z } from 'zod';

import type { UserService } from '../../application/user-service.js';

const userDataSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.email().max(254),
  })
  .strict();

export function createUserRouter(userService: UserService): Router {
  const router = Router();

  router.get('/', async (_request, response) => {
    response.json(await userService.listUsers());
  });

  router.get('/:id', async (request, response) => {
    const user = await userService.getUser(request.params.id ?? '');
    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }
    response.json(user);
  });

  router.post('/', async (request, response) => {
    const parsed = userDataSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid request body' });
      return;
    }
    response.status(201).json(await userService.createUser(parsed.data));
  });

  router.put('/:id', async (request, response) => {
    const parsed = userDataSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid request body' });
      return;
    }
    const user = await userService.updateUser(
      request.params.id ?? '',
      parsed.data,
    );
    if (!user) {
      response.status(404).json({ error: 'User not found' });
      return;
    }
    response.json(user);
  });

  router.delete('/:id', async (request, response) => {
    const deleted = await userService.deleteUser(request.params.id ?? '');
    if (!deleted) {
      response.status(404).json({ error: 'User not found' });
      return;
    }
    response.status(204).send();
  });

  return router;
}
