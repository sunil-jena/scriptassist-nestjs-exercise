import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  providers: [MetricsService, MetricsInterceptor],
  controllers: [MetricsController],
  exports: [MetricsService, MetricsInterceptor],
})
export class MetricsModule {}
