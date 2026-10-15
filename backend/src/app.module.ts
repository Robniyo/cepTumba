import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MembersModule } from './members/members.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { LoggingModule } from './logging/logging.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EventsModule } from './events/events.module';
import { FinanceModule } from './finance/finance.module';
import { DevotionModule } from './devotion/devotion.module';
import { PrayerCenterModule } from './prayer-center/prayer-center.module';
import { WelfareModule } from './welfare/welfare.module';
import { MinutesModule } from './minutes/minutes.module';
import { RequestsModule } from './requests/requests.module';
import { LeadershipModule } from './leadership/leadership.module';
import { FamiliesModule } from './families/families.module';
import { AlumniModule } from './alumni/alumni.module';
import { MessagingModule } from './messaging/messaging.module';
import { ContactsModule } from './contacts/contacts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    MembersModule,
    AnnouncementsModule,
    LoggingModule,
    NotificationsModule,
    EventsModule,
    FinanceModule,
    DevotionModule,
    PrayerCenterModule,
    WelfareModule,
    MinutesModule,
    RequestsModule,
    LeadershipModule,
    FamiliesModule,
    AlumniModule,
    MessagingModule,
    ContactsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
