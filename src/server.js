
import express from 'express';
import "dotenv/config";
import cors from "cors";
import pino from 'pino-http';


const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(pino());


const PORT = process.env.PORT || 3000;

app.get('/test-error', () => {
  throw new Error('Simulated server error');
});

app.get('/notes', (req, res) => {
  res.status(200).json({
    message: 'Retrieved all notes',
  });
});

app.get('/notes/:noteId', (req, res) => {
  const { noteId } = req.params;

  res.status(200).json({
	message: `Retrieved note with ID: ${noteId}`
});
});

app.use((req, res, next) => {
  res.status(404).json({
    message: "Route not found"
  });
});

app.use((err, req, res, next) => {
  res.status(500).json({
    message: err.message,
  });
});



app.listen(PORT,() => {
  console.log(`Server running on port ${PORT}`);
});
