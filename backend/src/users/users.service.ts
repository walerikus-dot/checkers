import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User } from './user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  async create(data: Partial<User>): Promise<User> {
    const existing = await this.repo.findOne({ where: [{ email: data.email }, { username: data.username }] });
    if (existing) throw new ConflictException('Email or username already taken');
    if (data.passwordHash) data.passwordHash = await bcrypt.hash(data.passwordHash, 12);
    const user = this.repo.create(data);
    return this.repo.save(user);
  }

  async findById(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id }, relations: ['rating'] });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<User> {
    return this.repo.findOne({ where: { email }, relations: ['rating'] });
  }

  async findByOAuth(provider: string, oauthId: string): Promise<User> {
    return this.repo.findOne({ where: { oauthProvider: provider, oauthId }, relations: ['rating'] });
  }

  async findByEmailChangeToken(token: string): Promise<User> {
    return this.repo.findOne({ where: { emailChangeToken: token } });
  }

  async search(query: string): Promise<User[]> {
    return this.repo.find({ where: { username: Like(`%${query}%`) }, take: 20 });
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async setOnline(id: string, isOnline: boolean): Promise<void> {
    await this.repo.update(id, { isOnline });
  }

  async remove(id: string): Promise<void> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.repo.remove(user);
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async getLeaderboard(limit = 50, offset = 0): Promise<User[]> {
    return this.repo.find({ relations: ['rating'], order: { rating: { rating: 'DESC' } }, take: limit, skip: offset });
  }
}
