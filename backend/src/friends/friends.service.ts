import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friend, FriendStatus } from './friend.entity';

@Injectable()
export class FriendsService {
  constructor(@InjectRepository(Friend) private repo: Repository<Friend>) {}

  async sendRequest(userId: string, friendId: string) {
    const f = this.repo.create({ user: { id: userId } as any, friend: { id: friendId } as any });
    return this.repo.save(f);
  }

  async accept(requestId: string, userId: string) {
    await this.repo.update(requestId, { status: FriendStatus.ACCEPTED });
    return this.repo.findOne({ where: { id: requestId } });
  }

  async remove(userId: string, friendId: string) {
    await this.repo.delete({ user: { id: userId } as any, friend: { id: friendId } as any });
  }

  async getFriends(userId: string) {
    return this.repo.find({ where: { user: { id: userId }, status: FriendStatus.ACCEPTED }, relations: ['friend'] });
  }

  async getRequests(userId: string) {
    return this.repo.find({ where: { friend: { id: userId }, status: FriendStatus.PENDING }, relations: ['user'] });
  }
}
