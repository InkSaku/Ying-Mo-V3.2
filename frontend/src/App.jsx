import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { ProtectedRoute, PublicOnlyRoute, AdminRoute } from "./components/RouteGuards";
import { AppShell } from "./components/AppShell";
import { PageLoader } from "./components/States";

function lazyNamed(loader, exportName) {
  return lazy(() => loader().then((module) => ({ default: module[exportName] })));
}

const LandingPage = lazyNamed(() => import("./pages/LandingPage"), "LandingPage");
const AboutPage = lazyNamed(() => import("./pages/AboutPage"), "AboutPage");
const LoginPage = lazyNamed(() => import("./pages/LoginPage"), "LoginPage");
const RegisterPage = lazyNamed(() => import("./pages/RegisterPage"), "RegisterPage");
const ForgotPasswordPage = lazyNamed(() => import("./pages/ForgotPasswordPage"), "ForgotPasswordPage");
const ResetPasswordPage = lazyNamed(() => import("./pages/ResetPasswordPage"), "ResetPasswordPage");
const VerifyEmailPage = lazyNamed(() => import("./pages/VerifyEmailPage"), "VerifyEmailPage");
const HomePage = lazyNamed(() => import("./pages/HomePage"), "HomePage");
const OnThisDayPage = lazyNamed(() => import("./pages/OnThisDayPage"), "OnThisDayPage");
const ExplorePage = lazyNamed(() => import("./pages/ExplorePage"), "ExplorePage");
const PostsPage = lazyNamed(() => import("./pages/PostsPage"), "PostsPage");
const PostDetailPage = lazyNamed(() => import("./pages/PostDetailPage"), "PostDetailPage");
const CollectionsPage = lazyNamed(() => import("./pages/CollectionsPage"), "CollectionsPage");
const CollectionDetailPage = lazyNamed(() => import("./pages/CollectionDetailPage"), "CollectionDetailPage");
const CollectionManagePage = lazyNamed(() => import("./pages/CollectionManagePage"), "CollectionManagePage");
const CreateCollectionPage = lazyNamed(() => import("./pages/CreateCollectionPage"), "CreateCollectionPage");
const ArchivePage = lazyNamed(() => import("./pages/ArchivePage"), "ArchivePage");
const SearchPage = lazyNamed(() => import("./pages/SearchPage"), "SearchPage");
const UserProfilePage = lazyNamed(() => import("./pages/UserProfilePage"), "UserProfilePage");
const WritePage = lazyNamed(() => import("./pages/WritePage"), "WritePage");
const MePage = lazyNamed(() => import("./pages/MePage"), "MePage");
const MyPostsPage = lazyNamed(() => import("./pages/MyPostsPage"), "MyPostsPage");
const PostRevisionsPage = lazyNamed(() => import("./pages/PostRevisionsPage"), "PostRevisionsPage");
const FavoritesPage = lazyNamed(() => import("./pages/FavoritesPage"), "FavoritesPage");
const NotificationsPage = lazyNamed(() => import("./pages/NotificationsPage"), "NotificationsPage");
const SettingsPage = lazyNamed(() => import("./pages/SettingsPage"), "SettingsPage");
const SessionsPage = lazyNamed(() => import("./pages/SessionsPage"), "SessionsPage");
const MyCommentsPage = lazyNamed(() => import("./pages/MyCommentsPage"), "MyCommentsPage");
const MyCollectionsPage = lazyNamed(() => import("./pages/MyCollectionsPage"), "MyCollectionsPage");
const TaxonomyPage = lazyNamed(() => import("./pages/TaxonomyPage"), "TaxonomyPage");
const TaxonomyIndexPage = lazyNamed(() => import("./pages/TaxonomyIndexPage"), "TaxonomyIndexPage");
const AdminPage = lazyNamed(() => import("./pages/AdminPage"), "AdminPage");
const AdminUsersPage = lazyNamed(() => import("./pages/AdminUsersPage"), "AdminUsersPage");
const AdminPostsPage = lazyNamed(() => import("./pages/AdminPostsPage"), "AdminPostsPage");
const AdminCollectionsPage = lazyNamed(() => import("./pages/AdminCollectionsPage"), "AdminCollectionsPage");
const AdminCommentsPage = lazyNamed(() => import("./pages/AdminCommentsPage"), "AdminCommentsPage");
const AdminCategoriesPage = lazyNamed(() => import("./pages/AdminTaxonomyPage"), "AdminCategoriesPage");
const AdminTagsPage = lazyNamed(() => import("./pages/AdminTaxonomyPage"), "AdminTagsPage");
const AdminMediaPage = lazyNamed(() => import("./pages/AdminMediaPage"), "AdminMediaPage");
const AdminFeaturedPage = lazyNamed(() => import("./pages/AdminFeaturedPage"), "AdminFeaturedPage");
const AdminSettingsPage = lazyNamed(() => import("./pages/AdminSettingsPage"), "AdminSettingsPage");
const AdminNotificationsPage = lazyNamed(() => import("./pages/AdminNotificationsPage"), "AdminNotificationsPage");
const AdminLogsPage = lazyNamed(() => import("./pages/AdminLogsPage"), "AdminLogsPage");
const NotFoundPage = lazyNamed(() => import("./pages/NotFoundPage"), "NotFoundPage");

export function App() {
  return (
    <Suspense fallback={<PageLoader label="正在读取页面" />}>
      <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/on-this-day" element={<OnThisDayPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/articles" element={<PostsPage type="article" />} />
        <Route path="/articles/:slug" element={<PostDetailPage type="article" />} />
        <Route path="/notes" element={<PostsPage type="note" />} />
        <Route path="/notes/:id" element={<PostDetailPage type="note" />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/new" element={<CreateCollectionPage />} />
        <Route path="/collections/:slug" element={<CollectionDetailPage />} />
        <Route path="/collections/:slug/manage" element={<CollectionManagePage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/users/:username" element={<UserProfilePage />} />
        <Route path="/categories" element={<TaxonomyIndexPage kind="category" />} />
        <Route path="/categories/:slug" element={<TaxonomyPage kind="category" />} />
        <Route path="/tags" element={<TaxonomyIndexPage kind="tag" />} />
        <Route path="/tags/:slug" element={<TaxonomyPage kind="tag" />} />
        <Route path="/write" element={<WritePage />} />
        <Route path="/write/:postId" element={<WritePage />} />
        <Route path="/me" element={<MePage />} />
        <Route path="/me/posts" element={<MyPostsPage />} />
        <Route path="/me/posts/:postId/revisions" element={<PostRevisionsPage />} />
        <Route path="/me/collections" element={<MyCollectionsPage />} />
        <Route path="/me/favorites" element={<FavoritesPage />} />
        <Route path="/me/comments" element={<MyCommentsPage />} />
        <Route path="/me/notifications" element={<NotificationsPage />} />
        <Route path="/me/settings" element={<SettingsPage />} />
        <Route path="/me/sessions" element={<SessionsPage />} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
        <Route path="/admin/posts" element={<AdminRoute><AdminPostsPage /></AdminRoute>} />
        <Route path="/admin/collections" element={<AdminRoute><AdminCollectionsPage /></AdminRoute>} />
        <Route path="/admin/comments" element={<AdminRoute><AdminCommentsPage /></AdminRoute>} />
        <Route path="/admin/categories" element={<AdminRoute><AdminCategoriesPage /></AdminRoute>} />
        <Route path="/admin/tags" element={<AdminRoute><AdminTagsPage /></AdminRoute>} />
        <Route path="/admin/media" element={<AdminRoute><AdminMediaPage /></AdminRoute>} />
        <Route path="/admin/featured" element={<AdminRoute><AdminFeaturedPage /></AdminRoute>} />
        <Route path="/admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />
        <Route path="/admin/notifications" element={<AdminRoute><AdminNotificationsPage /></AdminRoute>} />
        <Route path="/admin/logs" element={<AdminRoute><AdminLogsPage /></AdminRoute>} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
