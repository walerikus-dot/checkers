import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './message.entity';

@Injectable()
export class MessagesService {
  constructor(@InjectRepository(Message) private repo: Repository<Message>) {}

  async getByGame(gameId: string, limit = 50) {
    return this.repo.find({ where: { game: { id: gameId } }, relations: ['sender'], order: { createdAt: 'ASC' }, take: limit });
  }

  async create(gameId: string, senderId: string, content: string) {
    const msg = this.repo.create({ game: { id: gameId } as any, sender: { id: senderId } as any, content: content.substring(0, 500) });
    return this.repo.save(msg);
  }
}
