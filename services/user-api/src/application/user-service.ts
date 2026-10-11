import type { UserData } from '../domain/user.js';
import type { UserRepository } from './user-repository.js';

export class UserService {
  constructor(private readonly users: UserRepository) {}

  listUsers() {
    return this.users.findAll();
  }

  getUser(id: string) {
    return this.users.findById(id);
  }

  createUser(data: UserData) {
    return this.users.create(data);
  }

  updateUser(id: string, data: UserData) {
    return this.users.update(id, data);
  }

  deleteUser(id: string) {
    return this.users.delete(id);
  }
}
