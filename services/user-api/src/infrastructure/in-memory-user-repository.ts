import { randomUUID } from 'node:crypto';

import type { UserRepository } from '../application/user-repository.ts';
import type { User, UserData } from '../domain/user.ts';

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  findAll(): Promise<User[]> {
    return Promise.resolve([...this.users.values()]);
  }

  findById(id: string): Promise<User | undefined> {
    return Promise.resolve(this.users.get(id));
  }

  create(data: UserData): Promise<User> {
    const user = { id: randomUUID(), ...data };
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }

  update(id: string, data: UserData): Promise<User | undefined> {
    if (!this.users.has(id)) {
      return Promise.resolve(undefined);
    }

    const user = { id, ...data };
    this.users.set(id, user);
    return Promise.resolve(user);
  }

  delete(id: string): Promise<boolean> {
    return Promise.resolve(this.users.delete(id));
  }
}
