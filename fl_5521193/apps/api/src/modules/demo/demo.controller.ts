import { Inject, BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { DemoService, type ReplyVariant } from './demo.service';

@Controller('demo')
export class DemoController {
  constructor(@Inject(DemoService) private readonly demo: DemoService) {}

  @Get('state')
  state() {
    return this.demo.snapshot();
  }

  @Get('sources')
  sources() {
    return this.demo.sources();
  }

  @Post('reset')
  async reset() {
    await this.demo.reset();
    return { ok: true };
  }

  @Post('run-sample')
  runSample() {
    return this.demo.runSample();
  }

  @Post('reply')
  reply(@Body() body: { dealId?: string; variant?: ReplyVariant }) {
    if (!body.dealId) throw new BadRequestException('Нужен dealId');
    const variant = body.variant ?? 'interested';
    return this.demo.reply(body.dealId, variant);
  }

  @Post('qualify')
  qualify(@Body() body: { dealId?: string }) {
    if (!body.dealId) throw new BadRequestException('Нужен dealId');
    return this.demo.qualify(body.dealId);
  }
}
