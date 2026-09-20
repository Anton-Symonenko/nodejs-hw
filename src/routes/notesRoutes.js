import { Router } from 'express';
import { celebrate } from 'celebrate';
import {
  getAllNotesSchema,
  noteIdSchema,
} from '../validations/notesValidation.js';

import {
  getAllNotes,
  getNoteById,
  createNote,
  deleteNote,
  updateNote,
} from '../controllers/notesController.js';

const notesRoutes = Router();

notesRoutes.get('/notes', celebrate(getAllNotesSchema), getAllNotes);
notesRoutes.get('/notes/:noteId', celebrate(noteIdSchema), getNoteById);
notesRoutes.post('/notes', createNote);
notesRoutes.delete('/notes/:noteId', celebrate(noteIdSchema), deleteNote);
notesRoutes.patch('/notes/:noteId', updateNote);

export default notesRoutes;
