import { Router } from 'express';
import authRouter from './auth.routes.js';
import adminRouter from './admin.routes.js';
import admissionsRouter from './admissions.routes.js';
import attendanceRouter from './attendance.routes.js';
import dashboardRouter from './dashboard.routes.js';
import feesRouter from './fees.routes.js';
import healthRouter from './health.routes.js';
import libraryRouter from './library.routes.js';
import madrasaRouter from './madrasa.routes.js';
import messagesRouter from './messages.routes.js';
import newsRouter from './news.routes.js';
import notificationsRouter from './notifications.routes.js';
import operationsRouter from './operations.routes.js';
import profileRouter from './profile.routes.js';
import reportsRouter from './reports.routes.js';
import resultsRouter from './results.routes.js';
import resultTokenRouter from './resultTokens.routes.js';
import siteContentRouter from './siteContent.routes.js';
import timetableRouter from './timetable.routes.js';
import upcomingRouter from './upcoming.routes.js';

const apiRouter = Router();

apiRouter.use('/health', healthRouter);

apiRouter.use('/auth', authRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/operations', operationsRouter);
apiRouter.use('/profile', profileRouter);
apiRouter.use('/admissions', admissionsRouter);
apiRouter.use('/results', resultsRouter);
apiRouter.use('/result-tokens', resultTokenRouter);
apiRouter.use('/timetable', timetableRouter);
apiRouter.use('/fees', feesRouter);
apiRouter.use('/library', libraryRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/madrasa', madrasaRouter);
apiRouter.use('/messages', messagesRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/news', newsRouter);
apiRouter.use('/upcoming', upcomingRouter);
apiRouter.use('/site-content', siteContentRouter);

export default apiRouter;
