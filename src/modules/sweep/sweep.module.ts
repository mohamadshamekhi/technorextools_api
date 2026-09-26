import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SweepService } from './sweep.service';

/** Registers the in-process periodic sweep. Cores are @Global; AuthModule is imported for its token repos. */
@Module({
  imports: [AuthModule],
  providers: [SweepService],
})
export class SweepModule {}
