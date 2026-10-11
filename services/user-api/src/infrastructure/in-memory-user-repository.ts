import { randomUUID } from 'node:crypto';

import type { UserRepository } from '../application/user-repository.js';
import type { User, UserData } from '../domain/user.js';

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async findAll(): Promise<User[]> {
    return Promise.resolve([...this.users.values()]);
  }

  async findById(id: string): Promise<User | undefined> {
    return Promise.resolve(this.users.get(id));
  }

  async create(data: UserData): Promise<User> {
    const user = { id: randomUUID(), ...data };
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }

  async update(id: string, data: UserData): Promise<User | undefined> {
    if (!this.users.has(id)) return Promise.resolve(undefined);
    const user = { id, ...data };
    this.users.set(id, user);
    return Promise.resolve(user);
  }

  async delete(id: string): Promise<boolean> {
    return Promise.resolve(this.users.delete(id));
  }
}
