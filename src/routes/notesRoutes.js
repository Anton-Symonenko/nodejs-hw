import { Router } from 'express';
import { getAllNotes } from '../controllers/notesController.js';


const notesRoutes = Router();

notesRoutes.get('/notes', getAllNotes);

notesRoutes.get('/notes/:noteId', (req, res) => {
  const { noteId } = req.params;

  res.status(200).json({
	message: `Retrieved note with ID: ${noteId}`
});
});

export default notesRoutes;
