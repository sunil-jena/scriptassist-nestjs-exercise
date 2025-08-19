import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ResilientHttpService } from './resilient-http.service';

@Module({
  imports: [HttpModule],
  providers: [ResilientHttpService],
  exports: [ResilientHttpService],
})
export class ResilientHttpModule {}
