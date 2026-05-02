import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = process.env.BUG_REPORTS_DIR || '/opt/checkers/bug-reports';

function ensureDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

@Controller('bug-report')
export class BugReportsController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  submit(@Body() body: Record<string, unknown>) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid report payload');
    }

    ensureDir();

    // Filename: bug-YYYY-MM-DDTHH-MM-SS-<random4>.json
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const rand = Math.random().toString(36).slice(2, 6);
    const filename = `bug-${ts}-${rand}.json`;
    const filepath = path.join(REPORTS_DIR, filename);

    // Inject server-side timestamp (client timestamp stays in body)
    const report = { ...body, receivedAt: new Date().toISOString() };

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8');

    return { ok: true, filename };
  }
}
