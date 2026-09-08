import { Note } from "../models/note.js";

export const getAllNotes = async (req, res) => {
  const notes = await Note.find();

  res.status(200).json(notes);
};
