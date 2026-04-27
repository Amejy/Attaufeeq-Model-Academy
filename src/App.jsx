import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AOS from 'aos';
import 'aos/dist/aos.css';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ParticleField from './components/ParticleField';
import PageTransition from './components/PageTransition';
import BackToTopButton from './components/BackToTopButton';
import ProtectedRoute from './components/ProtectedRoute';
import useAdmissionPeriod from './hooks/useAdmissionPeriod';
import { SkeletonBlock } from './components/Skeleton';
import Login from './pages/Login';

const Home = lazy(() => import('./pages/Home'));
const Landing = lazy(() => import('./pages/Landing'));
const Madrasa = lazy(() => import('./pages/Madrasa'));
const About = lazy(() => import('./pages/About'));
const Academics = lazy(() => import('./pages/Academics'));
const Admissions = lazy(() => import('./pages/Admissions'));
const Staff = lazy(() => import('./pages/Staff'));
const Gallery = lazy(() => import('./pages/Gallery'));
const Contact = lazy(() => import('./pages/Contact'));
const NewsEvents = lazy(() => import('./pages/NewsEvents'));
const NewsEventDetail = lazy(() => import('./pages/NewsEventDetail'));
const Signup = lazy(() => import('./pages/Signup'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const PortalHome = lazy(() => import('./pages/PortalHome'));
const RoleDashboard = lazy(() => import('./pages/RoleDashboard'));
const ManageStudents = lazy(() => import('./pages/admin/ManageStudents'));
const ManageTeachers = lazy(() => import('./pages/admin/ManageTeachers'));
const ManageClasses = lazy(() => import('./pages/admin/ManageClasses'));
const ManageSubjects = lazy(() => import('./pages/admin/ManageSubjects'));
const ManageTeacherAssignments = lazy(() => import('./pages/admin/ManageTeacherAssignments'));
const ManageAdmissions = lazy(() => import('./pages/admin/ManageAdmissions'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const TeacherResults = lazy(() => import('./pages/teacher/TeacherResults'));
const TeacherUpcomingItems = lazy(() => import('./pages/teacher/TeacherUpcomingItems'));
const AdminResultsPublish = lazy(() => import('./pages/admin/AdminResultsPublish'));
const AdminPromotions = lazy(() => import('./pages/admin/AdminPromotions'));
const RoleResults = lazy(() => import('./pages/role/RoleResults'));
const FeeManagement = lazy(() => import('./pages/admin/FeeManagement'));
const RoleFeeStatus = lazy(() => import('./pages/role/RoleFeeStatus'));
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'));
const AdminWebsiteContent = lazy(() => import('./pages/admin/AdminWebsiteContent'));
const MyNotifications = lazy(() => import('./pages/role/MyNotifications'));
const StudentAnnouncements = lazy(() => import('./pages/role/StudentAnnouncements'));
const AdminSystemTools = lazy(() => import('./pages/admin/AdminSystemTools'));
const TeacherMadrasaRecords = lazy(() => import('./pages/teacher/TeacherMadrasaRecords'));
const RoleMadrasaProgress = lazy(() => import('./pages/role/RoleMadrasaProgress'));
const RoleMessages = lazy(() => import('./pages/role/RoleMessages'));
const AdminAuditLogs = lazy(() => import('./pages/admin/AdminAuditLogs'));
const ManageNewsEvents = lazy(() => import('./pages/admin/ManageNewsEvents'));
const ManageLibrary = lazy(() => import('./pages/admin/ManageLibrary'));
const RoleLibrary = lazy(() => import('./pages/role/RoleLibrary'));
const ManageTimetable = lazy(() => import('./pages/admin/ManageTimetable'));
const TeacherAttendance = lazy(() => import('./pages/teacher/TeacherAttendance'));
const AdminAttendanceOverview = lazy(() => import('./pages/admin/AdminAttendanceOverview'));
const RoleTimetable = lazy(() => import('./pages/role/RoleTimetable'));
const RoleAttendance = lazy(() => import('./pages/role/RoleAttendance'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const AdminAdmissionsAccess = lazy(() => import('./pages/admin/AdminAdmissionsAccess'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminResultTokens = lazy(() => import('./pages/admin/AdminResultTokens'));
const ResultChecker = lazy(() => import('./pages/ResultChecker'));
const AdmissionsResultTokens = lazy(() => import('./pages/admissions/AdmissionsResultTokens'));

function RouteLoader({ isPortalRoute }) {
  return (
    <div className={isPortalRoute ? 'min-h-[60vh] p-6 sm:p-8' : 'section-wrap py-16 sm:py-20'}>
      <div className="glass-panel mx-auto max-w-5xl overflow-hidden p-6 sm:p-8">
        <div className="grid gap-4">
          <SkeletonBlock className="h-3 w-32 rounded-full" />
          <SkeletonBlock className="h-10 w-full max-w-xl rounded-full" />
          <SkeletonBlock className="h-24 rounded-[28px]" />
          <div className="grid gap-4 md:grid-cols-3">
            <SkeletonBlock className="h-32 rounded-[24px]" />
            <SkeletonBlock className="h-32 rounded-[24px]" />
            <SkeletonBlock className="h-32 rounded-[24px]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const location = useLocation();
  const isPortalRoute = location.pathname.startsWith('/portal');
  const { isLoading: admissionLoading, periodOpen, admissionPeriod } = useAdmissionPeriod();
  const showAdmissionsBanner = !isPortalRoute && !admissionLoading && !periodOpen;
  const programPeriods = admissionPeriod?.programs || {};
  const modernPeriod = programPeriods.modern || {};
  const madrasaPeriod = programPeriods.madrasa || {};
  const memorizationPeriod = programPeriods.memorization || {};
  const showModernWindow = modernPeriod.startDate && modernPeriod.endDate;
  const showMadrasaWindow = madrasaPeriod.startDate && madrasaPeriod.endDate;
  const showMemorizationWindow = memorizationPeriod.startDate && memorizationPeriod.endDate;
  const hasProgramWindow = showModernWindow || showMadrasaWindow || showMemorizationWindow;
  const showLegacyWindow = !hasProgramWindow && admissionPeriod?.startDate && admissionPeriod?.endDate;

  useEffect(() => {
    if (!isPortalRoute) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [location.pathname, location.search, isPortalRoute]);

  useEffect(() => {
    AOS.init({
      duration: 800,
      once: true,
      easing: 'ease-out-cubic',
      offset: 72
    });
  }, []);

  useEffect(() => {
    AOS.refreshHard();
  }, [location.pathname, location.search]);

  return (
    <div className={`app-shell min-h-screen ${isPortalRoute ? 'app-shell--portal' : 'app-shell--public'}`}>
      <ParticleField variant={isPortalRoute ? 'portal' : 'public'} />
      {!isPortalRoute && <Navbar />}
      {showAdmissionsBanner && (
        <div className="admissions-lock-banner">
          <div className="section-wrap">
            <div className="admissions-lock-banner__inner">
              <span className="admissions-lock-banner__tag">Admissions Closed</span>
              <p>
                The admissions portal is currently unavailable. Please check back when the administration opens the window.
              </p>
              {showLegacyWindow && (
                <span className="admissions-lock-banner__dates">
                  Window: {new Date(admissionPeriod.startDate).toLocaleString()} – {new Date(admissionPeriod.endDate).toLocaleString()}
                </span>
              )}
              {!showLegacyWindow && showModernWindow && (
                <span className="admissions-lock-banner__dates">
                  ATTAUFEEQ Model Academy: {new Date(modernPeriod.startDate).toLocaleString()} – {new Date(modernPeriod.endDate).toLocaleString()}
                </span>
              )}
              {!showLegacyWindow && showMadrasaWindow && (
                <span className="admissions-lock-banner__dates">
                  Madrastul ATTAUFEEQ: {new Date(madrasaPeriod.startDate).toLocaleString()} – {new Date(madrasaPeriod.endDate).toLocaleString()}
                </span>
              )}
              {!showLegacyWindow && showMemorizationWindow && (
                <span className="admissions-lock-banner__dates">
                  Quran Memorization: {new Date(memorizationPeriod.startDate).toLocaleString()} – {new Date(memorizationPeriod.endDate).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      <Suspense fallback={<RouteLoader isPortalRoute={isPortalRoute} />}>
        <PageTransition routeKey={`${location.pathname}${location.search}`}>
          <Routes location={location}>
        <Route path="/" element={<Landing />} />
        <Route path="/public" element={<Navigate to="/" replace />} />
        <Route path="/modern-academy" element={<Home />} />
        <Route path="/madrastul-attaufiq" element={<Madrasa />} />
        <Route path="/about" element={<About />} />
        <Route path="/academics" element={<Academics />} />
        <Route path="/admissions" element={<Admissions />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/news" element={<NewsEvents />} />
        <Route path="/news/:slugOrId" element={<NewsEventDetail />} />
        <Route path="/result-checker" element={<ResultChecker />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login variant="family" defaultRole="student" />} />
          <Route path="/login/student" element={<Login variant="family" defaultRole="student" />} />
          <Route path="/login/parent" element={<Login variant="family" defaultRole="parent" />} />
          <Route path="/staff-access" element={<Login variant="staff" defaultRole="admin" />} />
          <Route path="/staff-access/admin" element={<Login variant="staff" defaultRole="admin" />} />
          <Route path="/staff-access/teacher" element={<Login variant="staff" defaultRole="teacher" />} />
          <Route path="/staff-access/admissions" element={<Login variant="staff" defaultRole="admissions" />} />
          <Route path="/login/teacher" element={<Navigate to="/staff-access/teacher" replace />} />
          <Route path="/login/admissions" element={<Navigate to="/staff-access/admissions" replace />} />
          <Route path="/login/admin" element={<Navigate to="/staff-access/admin" replace />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/portal"
          element={
            <ProtectedRoute>
              <PortalHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/change-password"
          element={
            <ProtectedRoute>
              <ChangePassword />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <RoleDashboard role="admin" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/students"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ManageStudents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/result-tokens"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminResultTokens />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/teachers"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ManageTeachers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/classes"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ManageClasses />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/subjects"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ManageSubjects />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/teacher-assignments"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ManageTeacherAssignments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/reports"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminReports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/admissions-access"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminAdmissionsAccess />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/results"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminResultsPublish />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/promotions"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminPromotions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/fees"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <FeeManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/library"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ManageLibrary />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/timetable"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ManageTimetable />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/attendance"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminAttendanceOverview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/notifications"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminNotifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/news"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ManageNewsEvents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/website"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminWebsiteContent />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/system"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminSystemTools />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/security"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminAuditLogs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admin/messages"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <RoleMessages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admissions"
          element={
            <ProtectedRoute allowedRoles={['admissions']} requiredFeature="overview">
              <RoleDashboard role="admissions" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admissions/review"
          element={
            <ProtectedRoute allowedRoles={['admissions']} requiredFeature="admissions">
              <ManageAdmissions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admissions/students"
          element={
            <ProtectedRoute allowedRoles={['admissions']} requiredFeature="students">
              <ManageStudents role="admissions" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admissions/fees"
          element={
            <ProtectedRoute allowedRoles={['admissions']} requiredFeature="fees">
              <FeeManagement role="admissions" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admissions/news"
          element={
            <ProtectedRoute allowedRoles={['admissions']} requiredFeature="news">
              <ManageNewsEvents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admissions/library"
          element={
            <ProtectedRoute allowedRoles={['admissions']} requiredFeature="library">
              <ManageLibrary />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admissions/messages"
          element={
            <ProtectedRoute allowedRoles={['admissions']} requiredFeature="messages">
              <RoleMessages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/admissions/result-tokens"
          element={
            <ProtectedRoute allowedRoles={['admissions']} requiredFeature="result-tokens">
              <AdmissionsResultTokens />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/teacher"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <RoleDashboard role="teacher" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/teacher/results"
          element={
            <ProtectedRoute allowedRoles={['teacher']} requiredFeature="results">
              <TeacherResults />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/teacher/attendance"
          element={
            <ProtectedRoute allowedRoles={['teacher']} requiredFeature="attendance">
              <TeacherAttendance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/teacher/timetable"
          element={
            <ProtectedRoute allowedRoles={['teacher']} requiredFeature="timetable">
              <RoleTimetable role="teacher" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/teacher/upcoming"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <TeacherUpcomingItems />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/teacher/madrasa"
          element={
            <ProtectedRoute allowedRoles={['teacher']} requiredFeature="madrasa">
              <TeacherMadrasaRecords />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/teacher/notifications"
          element={
            <ProtectedRoute allowedRoles={['teacher']} requiredFeature="notifications">
              <MyNotifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/teacher/messages"
          element={
            <ProtectedRoute allowedRoles={['teacher']} requiredFeature="messages">
              <RoleMessages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/student"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <RoleDashboard role="student" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/student/results"
          element={
            <ProtectedRoute allowedRoles={['student']} requiredFeature="results">
              <RoleResults role="student" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/student/fees"
          element={
            <ProtectedRoute allowedRoles={['student']} requiredFeature="fees">
              <RoleFeeStatus role="student" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/student/announcements"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentAnnouncements />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/student/notifications"
          element={
            <ProtectedRoute allowedRoles={['student']} requiredFeature="notifications">
              <MyNotifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/student/madrasa"
          element={
            <ProtectedRoute allowedRoles={['student']} requiredFeature="madrasa">
              <RoleMadrasaProgress role="student" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/student/messages"
          element={
            <ProtectedRoute allowedRoles={['student']} requiredFeature="messages">
              <RoleMessages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/student/library"
          element={
            <ProtectedRoute allowedRoles={['student']} requiredFeature="library">
              <RoleLibrary role="student" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/student/timetable"
          element={
            <ProtectedRoute allowedRoles={['student']} requiredFeature="timetable">
              <RoleTimetable role="student" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/student/attendance"
          element={
            <ProtectedRoute allowedRoles={['student']} requiredFeature="attendance">
              <RoleAttendance role="student" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/parent"
          element={
            <ProtectedRoute allowedRoles={['parent']}>
              <RoleDashboard role="parent" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/parent/results"
          element={
            <ProtectedRoute allowedRoles={['parent']} requiredFeature="results">
              <RoleResults role="parent" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/parent/fees"
          element={
            <ProtectedRoute allowedRoles={['parent']} requiredFeature="fees">
              <RoleFeeStatus role="parent" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/parent/notifications"
          element={
            <ProtectedRoute allowedRoles={['parent']} requiredFeature="notifications">
              <MyNotifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/parent/madrasa"
          element={
            <ProtectedRoute allowedRoles={['parent']} requiredFeature="madrasa">
              <RoleMadrasaProgress role="parent" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/parent/messages"
          element={
            <ProtectedRoute allowedRoles={['parent']} requiredFeature="messages">
              <RoleMessages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/parent/library"
          element={
            <ProtectedRoute allowedRoles={['parent']} requiredFeature="library">
              <RoleLibrary role="parent" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/parent/timetable"
          element={
            <ProtectedRoute allowedRoles={['parent']} requiredFeature="timetable">
              <RoleTimetable role="parent" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal/parent/attendance"
          element={
            <ProtectedRoute allowedRoles={['parent']} requiredFeature="attendance">
              <RoleAttendance role="parent" />
            </ProtectedRoute>
          }
        />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PageTransition>
      </Suspense>
      {!isPortalRoute && <BackToTopButton />}
      {!isPortalRoute && <Footer />}
    </div>
  );
}

export default App;
