import { Module } from '@nestjs/common';
import { BackofficeUsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [BackofficeUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class BackofficeUsersModule {}
