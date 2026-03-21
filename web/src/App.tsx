import { Routes, Route, Navigate } from "react-router-dom";
import NotesListPage from "./pages/NotesListPage";
import NoteEditPage from "./pages/NoteEditPage";
import NoteViewPage from "./pages/NoteViewPage";
import GuestPage from "./pages/GuestPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/notes" replace />} />
      <Route path="/notes" element={<NotesListPage />} />
      <Route path="/notes/:id/edit" element={<NoteEditPage />} />
      <Route path="/notes/:id" element={<NoteViewPage />} />
      <Route path="/guest" element={<GuestPage />} />
    </Routes>
  );
}
