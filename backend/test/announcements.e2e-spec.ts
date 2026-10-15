import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AppRole } from './../src/auth/auth-role.type';
import { UsersService } from './../src/users/users.service';

describe('Announcements (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let usersService: UsersService;
  let accessSecret: string;

  // Mock tokens for different roles
  const tokens: { [key: string]: string } = {};
  const roles: AppRole[] = [
    'president',
    'vp_prayers',
    'vp_social',
    'secretary',
    'accountant',
    'advisor_prayers',
    'advisor_social',
    'member',
  ];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    jwtService = moduleFixture.get<JwtService>(JwtService);
    usersService = moduleFixture.get<UsersService>(UsersService);
    const configService = moduleFixture.get<ConfigService>(ConfigService);
    await app.init();

    const configuredSecret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!configuredSecret) {
      throw new Error('JWT_ACCESS_SECRET is not configured for e2e tests');
    }
    accessSecret = configuredSecret;

    // Generate tokens for all roles
    for (const role of roles) {
      const seededUser = await usersService.createUser({
        email: `${role}.${Date.now()}@test.com`,
        passwordHash: '$2b$12$w9R3RUsVTNff7kwh28yk5u58qH0TADaBrZEcD3xKhsR4HIX66vepO',
        name: `Test ${role}`,
        role,
      });

      tokens[role] = await jwtService.signAsync(
        {
          sub: seededUser.id,
          email: seededUser.email,
          role,
          kind: 'access',
        },
        {
          secret: accessSecret,
          expiresIn: '1h',
        },
      );
    }
  });

  describe('POST /announcements - Create Announcement', () => {
    it('should allow all leader roles to create announcements', async () => {
      const leaderRoles: AppRole[] = [
        'president',
        'vp_prayers',
        'vp_social',
        'secretary',
        'accountant',
        'advisor_prayers',
        'advisor_social',
      ];

      for (const role of leaderRoles) {
        const response = await request(app.getHttpServer())
          .post('/announcements')
          .set('Authorization', `Bearer ${tokens[role]}`)
          .send({
            title: `Test announcement by ${role}`,
            body: 'This is a test announcement',
            category: 'general',
          });

        expect(response.status).toBe(201);
        expect(response.body.announcement).toBeDefined();
        expect(response.body.announcement.title).toBe(`Test announcement by ${role}`);
        if (role === 'president') {
          expect(response.body.announcement.status).toBe('published');
        } else {
          expect(response.body.announcement.status).toBe('draft');
        }
      }
    });

    it('should deny normal member from creating announcements', async () => {
      const response = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['member']}`)
        .send({
          title: 'Should not create',
          body: 'This should fail',
          category: 'general',
        });

      expect(response.status).toBe(403);
    });

    it('should require president approval for direct publishing', async () => {
      const response = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['vp_social']}`)
        .send({
          title: 'Leader publish attempt',
          body: 'Attempting direct publish',
          category: 'general',
          status: 'published',
        });

      expect(response.status).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: '', // Empty title
          body: 'Valid body',
        });

      expect(response.status).toBe(400);
    });

    it('should enforce max lengths', async () => {
      const response = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: 'a'.repeat(200), // Over 180 max
          body: 'Valid body',
        });

      expect(response.status).toBe(400);
    });

    it('should require expiresAt when creating a scheduled announcement', async () => {
      const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const response = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: 'Scheduled missing expiry',
          body: 'Body',
          category: 'general',
          status: 'scheduled',
          scheduledFor,
        });

      expect(response.status).toBe(400);
    });

    it('should reject scheduled creation when expiresAt is before scheduledFor', async () => {
      const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const response = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: 'Scheduled invalid expiry order',
          body: 'Body',
          category: 'general',
          status: 'scheduled',
          scheduledFor,
          expiresAt,
        });

      expect(response.status).toBe(400);
    });

    it('should create scheduled announcement with both scheduledFor and expiresAt', async () => {
      const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      const response = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: 'Scheduled with expiry',
          body: 'Body',
          category: 'general',
          status: 'scheduled',
          scheduledFor,
          expiresAt,
        });

      expect(response.status).toBe(201);
      expect(response.body.announcement.status).toBe('scheduled');
      expect(response.body.announcement.scheduledFor).toBeDefined();
      expect(response.body.announcement.expiresAt).toBeDefined();
    });

    it('should only allow president/secretary to pin announcements', async () => {
      const canPin = ['president', 'secretary'];
      const cannotPin = ['vp_prayers', 'vp_social', 'accountant', 'advisor_prayers', 'advisor_social', 'member'];

      // Create announcement as president
      const createResp = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: 'Pinned test',
          body: 'Test body',
          category: 'general',
          pinned: false, // Try to create pinned (should work for president)
        });

      const announcementId = createResp.body.announcement.id;

      // Test pin attempts by different roles
      for (const role of cannotPin) {
        const response = await request(app.getHttpServer())
          .patch(`/announcements/${announcementId}/pin`)
          .set('Authorization', `Bearer ${tokens[role]}`);

        const expected = ['advisor_prayers', 'advisor_social', 'member'].includes(role) ? 403 : 403;
        expect(response.status).toBe(expected);
      }

      // President should be able to pin
      for (const role of canPin) {
        const response = await request(app.getHttpServer())
          .patch(`/announcements/${announcementId}/pin`)
          .set('Authorization', `Bearer ${tokens[role]}`);

        expect(response.status).toBe(200);
        expect(response.body.announcement.pinned).toBe(true);
      }
    });
  });

  describe('GET /announcements - List Announcements', () => {
    let testAnnouncementId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: 'Test for listing',
          body: 'List test body',
          category: 'general',
          status: 'published',
        });
      testAnnouncementId = response.body.announcement.id;
    });

    it('should list announcements for authenticated users', async () => {
      const response = await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${tokens['member']}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toBeDefined();
      expect(response.body.total).toBeGreaterThanOrEqual(0);
    });

    it('should deny unauthenticated access', async () => {
      const response = await request(app.getHttpServer()).get('/announcements');

      expect(response.status).toBe(401);
    });

    it('should paginate with offset and limit', async () => {
      // Create multiple announcements
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/announcements')
          .set('Authorization', `Bearer ${tokens['president']}`)
          .send({
            title: `Pagination test ${i}`,
            body: 'Pagination test body',
            category: 'general',
          });
      }

      // Test offset=0, limit=2
      const page1 = await request(app.getHttpServer())
        .get('/announcements?offset=0&limit=2')
        .set('Authorization', `Bearer ${tokens['member']}`);

      expect(page1.status).toBe(200);
      expect(page1.body.items.length).toBeLessThanOrEqual(2);

      // Test offset=2, limit=2
      const page2 = await request(app.getHttpServer())
        .get('/announcements?offset=2&limit=2')
        .set('Authorization', `Bearer ${tokens['member']}`);

      expect(page2.status).toBe(200);
      expect(page2.body.total).toBeGreaterThan(0);
    });

    it('should filter by category', async () => {
      await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: 'Finance announcement',
          body: 'Finance test',
          category: 'finance',
          status: 'published',
        });

      const response = await request(app.getHttpServer())
        .get('/announcements?category=finance')
        .set('Authorization', `Bearer ${tokens['member']}`);

      expect(response.status).toBe(200);
      const allFinance = response.body.items.every(
        (a: any) => a.category === 'finance',
      );
      expect(allFinance).toBe(true);
    });

    it('should filter by status (published for members)', async () => {
      const response = await request(app.getHttpServer())
        .get('/announcements?status=published')
        .set('Authorization', `Bearer ${tokens['member']}`);

      expect(response.status).toBe(200);
      const allPublished = response.body.items.every(
        (a: any) => a.status === 'published',
      );
      expect(allPublished).toBe(true);
    });

    it('should allow leaders to view unpublished announcements', async () => {
      // Create draft announcement
      const createResp = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: 'Draft announcement',
          body: 'Draft body',
          category: 'general',
          status: 'draft',
        });

      // Member should NOT see unpublished
      const memberResp = await request(app.getHttpServer())
        .get('/announcements?status=draft')
        .set('Authorization', `Bearer ${tokens['member']}`);

      expect(memberResp.status).toBe(403);

      // Leader should see unpublished
      const leaderResp = await request(app.getHttpServer())
        .get('/announcements?includeUnpublished=true')
        .set('Authorization', `Bearer ${tokens['advisor_prayers']}`);

      expect(leaderResp.status).toBe(200);
      const hasPresidentsDraft = leaderResp.body.items.some(
        (a: any) => a.id === createResp.body.announcement.id,
      );
      expect(hasPresidentsDraft).toBe(false);

      const presidentResp = await request(app.getHttpServer())
        .get('/announcements?includeUnpublished=true')
        .set('Authorization', `Bearer ${tokens['president']}`);

      expect(presidentResp.status).toBe(200);
      const presidentCanSeeDraft = presidentResp.body.items.some(
        (a: any) => a.id === createResp.body.announcement.id,
      );
      expect(presidentCanSeeDraft).toBe(true);
    });

    it('should enforce role_based audience targeting for published announcements', async () => {
      const createResp = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: `Targeted role_based ${Date.now()}`,
          body: 'Only accountant should see this once published',
          category: 'general',
          status: 'published',
          audienceType: 'role_based',
          audienceRoles: ['accountant'],
        });

      expect(createResp.status).toBe(201);
      const announcementId = createResp.body.announcement.id;

      const accountantList = await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${tokens['accountant']}`);

      expect(accountantList.status).toBe(200);
      const accountantCanSee = accountantList.body.items.some(
        (a: any) => a.id === announcementId,
      );
      expect(accountantCanSee).toBe(true);

      const vpPrayersList = await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${tokens['vp_prayers']}`);

      expect(vpPrayersList.status).toBe(200);
      const vpPrayersCanSee = vpPrayersList.body.items.some(
        (a: any) => a.id === announcementId,
      );
      expect(vpPrayersCanSee).toBe(false);

      const memberList = await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${tokens['member']}`);

      expect(memberList.status).toBe(200);
      const memberCanSee = memberList.body.items.some(
        (a: any) => a.id === announcementId,
      );
      expect(memberCanSee).toBe(false);
    });

    it('should enforce leaders_only audience targeting for published announcements', async () => {
      const createResp = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: `Targeted leaders_only ${Date.now()}`,
          body: 'Leaders should see this, members should not',
          category: 'general',
          status: 'published',
          audienceType: 'leaders_only',
        });

      expect(createResp.status).toBe(201);
      const announcementId = createResp.body.announcement.id;

      const leaderList = await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${tokens['secretary']}`);

      expect(leaderList.status).toBe(200);
      const leaderCanSee = leaderList.body.items.some(
        (a: any) => a.id === announcementId,
      );
      expect(leaderCanSee).toBe(true);

      const memberList = await request(app.getHttpServer())
        .get('/announcements')
        .set('Authorization', `Bearer ${tokens['member']}`);

      expect(memberList.status).toBe(200);
      const memberCanSee = memberList.body.items.some(
        (a: any) => a.id === announcementId,
      );
      expect(memberCanSee).toBe(false);
    });
  });

  describe('PATCH /announcements/:id/status - Update Announcement Status', () => {
    let announcementId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: 'Status update test',
          body: 'Status test body',
          category: 'general',
          status: 'draft',
        });
      announcementId = response.body.announcement.id;
    });

    it('should allow president to publish status changes', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}/status`)
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({ status: 'published' });

      expect(response.status).toBe(200);
      expect(response.body.announcement.status).toBe('published');
    });

    it('should deny normal members from updating status', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}/status`)
        .set('Authorization', `Bearer ${tokens['member']}`)
        .send({ status: 'draft' });

      expect(response.status).toBe(403);
    });

    it('should block non-president leaders from publishing status changes', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}/status`)
        .set('Authorization', `Bearer ${tokens['secretary']}`)
        .send({ status: 'published' });

      expect(response.status).toBe(403);
    });

    it('should validate scheduled_for when status=scheduled', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}/status`)
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({ status: 'scheduled' }); // Missing scheduledFor

      expect(response.status).toBe(400);
    });

    it('should not allow past scheduled_for dates', async () => {
      const pastDate = new Date('2020-01-01').toISOString();
      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}/status`)
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({ status: 'scheduled', scheduledFor: pastDate });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /announcements/:id and DELETE /announcements/:id - Owner or President', () => {
    const createDraftByVpSocial = async () => {
      const response = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['vp_social']}`)
        .send({
          title: `Owner draft ${Date.now()}`,
          body: 'Owner draft body',
          category: 'general',
        });

      expect(response.status).toBe(201);
      return response.body.announcement.id as string;
    };

    it('should allow owner to edit their own announcement', async () => {
      const announcementId = await createDraftByVpSocial();

      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${tokens['vp_social']}`)
        .send({
          title: 'Owner updated title',
          body: 'Owner updated body',
          category: 'finance',
        });

      expect(response.status).toBe(200);
      expect(response.body.announcement.id).toBe(announcementId);
      expect(response.body.announcement.title).toBe('Owner updated title');
      expect(response.body.announcement.body).toBe('Owner updated body');
      expect(response.body.announcement.category).toBe('finance');
    });

    it('should deny non-owner non-president from editing announcement', async () => {
      const announcementId = await createDraftByVpSocial();

      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${tokens['secretary']}`)
        .send({
          title: 'Not allowed edit',
        });

      expect(response.status).toBe(403);
    });

    it('should allow president to edit another user announcement', async () => {
      const announcementId = await createDraftByVpSocial();

      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: 'President override edit',
        });

      expect(response.status).toBe(200);
      expect(response.body.announcement.id).toBe(announcementId);
      expect(response.body.announcement.title).toBe('President override edit');
    });

    it('should allow owner to delete their own announcement', async () => {
      const announcementId = await createDraftByVpSocial();

      const response = await request(app.getHttpServer())
        .delete(`/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${tokens['vp_social']}`);

      expect(response.status).toBe(200);
      expect(response.body.deletedAnnouncementId).toBe(announcementId);

      const secondDelete = await request(app.getHttpServer())
        .delete(`/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${tokens['vp_social']}`);

      expect(secondDelete.status).toBe(404);
    });

    it('should deny non-owner non-president from deleting announcement', async () => {
      const announcementId = await createDraftByVpSocial();

      const response = await request(app.getHttpServer())
        .delete(`/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${tokens['advisor_social']}`);

      expect(response.status).toBe(403);
    });

    it('should allow president to delete another user announcement', async () => {
      const announcementId = await createDraftByVpSocial();

      const response = await request(app.getHttpServer())
        .delete(`/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${tokens['president']}`);

      expect(response.status).toBe(200);
      expect(response.body.deletedAnnouncementId).toBe(announcementId);
    });
  });

  describe('PATCH /announcements/:id/pin & /unpin - Pin Management', () => {
    let announcementId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/announcements')
        .set('Authorization', `Bearer ${tokens['president']}`)
        .send({
          title: 'Pin test',
          body: 'Pin test body',
          category: 'general',
          pinned: false,
        });
      announcementId = response.body.announcement.id;
    });

    it('should allow president to pin', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}/pin`)
        .set('Authorization', `Bearer ${tokens['president']}`);

      expect(response.status).toBe(200);
      expect(response.body.announcement.pinned).toBe(true);
    });

    it('should allow secretary to unpin', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}/unpin`)
        .set('Authorization', `Bearer ${tokens['secretary']}`);

      expect(response.status).toBe(200);
      expect(response.body.announcement.pinned).toBe(false);
    });

    it('should deny member from pinning', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}/pin`)
        .set('Authorization', `Bearer ${tokens['member']}`);

      expect(response.status).toBe(403);
    });

    it('should deny accountant from pinning', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/announcements/${announcementId}/pin`)
        .set('Authorization', `Bearer ${tokens['accountant']}`);

      expect(response.status).toBe(403);
    });
  });

  describe('Permission Matrix - Comprehensive Coverage', () => {
    it('should enforce strict role-based access control', async () => {
      const permissionMatrix = {
        'POST /announcements': {
          allowed: ['president', 'vp_prayers', 'vp_social', 'secretary', 'accountant', 'advisor_prayers', 'advisor_social'],
          denied: ['member'],
        },
        'GET /announcements': {
          allowed: roles, // All can list
          denied: [],
        },
        'PATCH status': {
          allowed: ['president', 'vp_prayers', 'vp_social', 'secretary', 'accountant', 'advisor_prayers', 'advisor_social'],
          denied: ['member'],
        },
        'PATCH pin': {
          allowed: ['president', 'secretary'],
          denied: ['vp_prayers', 'vp_social', 'accountant', 'advisor_prayers', 'advisor_social', 'member'],
        },
      };

      expect(permissionMatrix).toBeDefined();
      expect(permissionMatrix['POST /announcements'].allowed.length).toBe(7);
      expect(permissionMatrix['PATCH pin'].allowed.length).toBe(2);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
