import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  const appServiceMock = {
    getHealth: () => ({
      status: 'ok',
      service: 'cep-tumba-backend',
      timestamp: new Date().toISOString(),
    }),
    getPublicStats: async () => ({
      membersCount: 0,
      weeklyActivities: 0,
      yearsStrong: 0,
    }),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appServiceMock }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return a healthy service status', () => {
      const result = appController.getHealth();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('cep-tumba-backend');
      expect(typeof result.timestamp).toBe('string');
    });

    it('should return public stats', async () => {
      const result = await appController.getPublicStats();
      expect(typeof result.membersCount).toBe('number');
      expect(typeof result.weeklyActivities).toBe('number');
      expect(typeof result.yearsStrong).toBe('number');
    });
  });
});
