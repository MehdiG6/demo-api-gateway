import type { User, UserData } from '../domain/user.ts';

export interface UserRepository {
  findAll(): Promise<User[]>;
  findById(id: string): Promise<User | undefined>;
  create(data: UserData): Promise<User>;
  update(id: string, data: UserData): Promise<User | undefined>;
  delete(id: string): Promise<boolean>;
}
