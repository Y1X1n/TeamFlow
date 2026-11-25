import { Module } from '@nestjs/common';
import { AgentMailService } from './agent-mail.service';

@Module({
  providers: [AgentMailService],
  exports: [AgentMailService],
})
export class MailModule {}
