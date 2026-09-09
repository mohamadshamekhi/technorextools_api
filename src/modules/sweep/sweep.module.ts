import { Module } from '@nestjs/common';
import { SweepService } from './sweep.service';

/** Registers the in-process periodic sweep. All deps come from @Global cores. */
@Module({
  providers: [SweepService],
})
export class SweepModule {}
