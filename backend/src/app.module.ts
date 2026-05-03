import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GamesModule } from './games/games.module';
import { RatingsModule } from './ratings/ratings.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { FriendsModule } from './friends/friends.module';
import { MessagesModule } from './messages/messages.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { GuestModule } from './guest/guest.module';
import { BugReportsModule } from './bug-reports/bug-reports.module';
import { AdminModule } from './admin/admin.module';
import { BetsModule } from './bets/bets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('POSTGRES_USER', 'checkers_user'),
        password: config.get('POSTGRES_PASSWORD', 'changeme_db_password'),
        database: config.get('POSTGRES_DB', 'checkers'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') !== 'production' || config.get('DB_SYNC') === 'true',
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    UsersModule,
    GamesModule,
    RatingsModule,
    TournamentsModule,
    FriendsModule,
    MessagesModule,
    MatchmakingModule,
    GuestModule,
    BugReportsModule,
    AdminModule,
    BetsModule,
  ],
})
export class AppModule {}
