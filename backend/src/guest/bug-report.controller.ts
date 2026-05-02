import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = process.env.BUG_REPORTS_DIR || '/opt/checkers/bug-reports';

@Controller('api')
export class BugReportController {
  @Post('bug-report')
  save(@Body() body: unknown, @Res() res: Response) {
    try {
      if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
      }
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `bug-${ts}.json`;
      const filepath = path.join(REPORTS_DIR, filename);
      fs.writeFileSync(filepath, JSON.stringify(body, null, 2), 'utf8');
      return res.status(201).json({ ok: true, filename });
    } catch (err) {
      console.error('[BugReport] failed to save:', err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  }
}
