import { Route, Routes } from "react-router";
import { Home } from "./pages/Home";
import { Navbar } from "./components/Navbar";
import { CreatePostPage } from "./pages/CreatePostPage";
import { PostPage } from "./pages/PostPage";
import { CreateCommunityPage } from "./pages/CreateCommunityPage";
import { CommunitiesPage } from "./pages/CommunitiesPage";
import { CommunityPage } from "./pages/CommunityPage";
import { CommunityRulesPage } from "./pages/CommunityRulesPage";
import { CommunitySettingsPage } from "./pages/CommunitySettingsPage";
import { CommunityModerationPage } from "./pages/CommunityModerationPage";
import { CommunityMembersAdminPage } from "./pages/CommunityMembersAdminPage";
import { ManageCommunityPage } from "./pages/ManageCommunityPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SearchPage } from "./pages/SearchPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SavedPostsPage } from "./pages/SavedPostsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { MessagesPage } from "./pages/MessagesPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SignupPage } from "./pages/SignupPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

function App() {
  return (
    <div className="min-h-screen pt-[68px] max-[760px]:pt-[60px]">
      <Navbar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreatePostPage />} />
        <Route path="/saved" element={<SavedPostsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:conversationId" element={<MessagesPage />} />
        <Route path="/post/:id" element={<PostPage />} />
        <Route path="/community/create" element={<CreateCommunityPage />} />
        <Route path="/communities" element={<CommunitiesPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/community/:id/rules" element={<CommunityRulesPage />} />
        <Route path="/community/:id/settings" element={<CommunitySettingsPage />} />
        <Route path="/community/:id/moderation" element={<CommunityModerationPage />} />
        <Route path="/community/:id/members/manage" element={<CommunityMembersAdminPage />} />
        <Route path="/community/:id/manage" element={<ManageCommunityPage />} />
        <Route path="/community/:id" element={<CommunityPage />} />
        <Route path="/profile/:username" element={<ProfilePage />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </div>
  );
}

export default App;
