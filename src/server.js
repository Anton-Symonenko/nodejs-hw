
import express from 'express';
import "dotenv/config";


const app = express();

const PORT = process.env.PORT || 3001;


app.get('/notes', (req, res) => {
  res.status(200).json({
    message: 'Retrieved all notes',
  });
});




app.listen(PORT,() => {
  console.log(`Server running on port ${PORT}`);
});
