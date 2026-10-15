import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

type PublicStatsRow = {
  members_count: number;
  weekly_activities: number;
  years_strong: number;
};

@Injectable()
export class AppService {
  constructor(private readonly databaseService: DatabaseService) {}

  getHealth() {
    return {
      status: 'ok',
      service: 'cep-tumba-backend',
      timestamp: new Date().toISOString(),
    };
  }

  async getPublicStats() {
    const result = await this.databaseService.query<PublicStatsRow>(
      `
      WITH member_counts AS (
        SELECT COUNT(*)::int AS members_count
        FROM members
        WHERE status = 'active'
      ),
      weekly_activities AS (
        SELECT COUNT(*)::int AS weekly_activities
        FROM (
          SELECT e.id, gs.day::date AS occurrence_date
          FROM events e
          CROSS JOIN generate_series(
            CURRENT_DATE::timestamp,
            (CURRENT_DATE + INTERVAL '6 days')::timestamp,
            INTERVAL '1 day'
          ) AS gs(day)
          WHERE (
            e.recurring = false
            AND gs.day::date BETWEEN e.start_date AND COALESCE(e.end_date, e.start_date)
          )
          OR (
            e.recurring = true
            AND gs.day::date >= e.start_date
            AND (e.end_date IS NULL OR gs.day::date <= e.end_date)
            AND e.weekday = EXTRACT(DOW FROM gs.day)::int
          )
          GROUP BY e.id, gs.day::date
        ) occurrences
      ),
      first_activity AS (
        SELECT MIN(activity_date) AS first_date
        FROM (
          SELECT MIN(COALESCE(joined_at, created_at::date)) AS activity_date FROM members
          UNION ALL
          SELECT MIN(start_date) AS activity_date FROM events
        ) source
      )
      SELECT
        m.members_count,
        w.weekly_activities,
        CASE
          WHEN f.first_date IS NULL THEN 0
          ELSE GREATEST(1, EXTRACT(YEAR FROM age(CURRENT_DATE, f.first_date))::int)
        END AS years_strong
      FROM member_counts m
      CROSS JOIN weekly_activities w
      CROSS JOIN first_activity f
      `,
    );

    const row = result.rows[0];
    return {
      membersCount: Number(row?.members_count ?? 0),
      weeklyActivities: Number(row?.weekly_activities ?? 0),
      yearsStrong: Number(row?.years_strong ?? 0),
    };
  }
}
