import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

// Tu asistente CROSTA (NO pongas el ID aquí, lo pondremos en Render)
const ASSISTANT_ID = process.env.CROSTA_ASSISTANT_ID;

// Cliente OpenAI con API Key segura (en Render la configuramos)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Endpoint principal del chat
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    const response = await client.responses.create({
      assistant_id: ASSISTANT_ID,
      input: messages,
    });

    const answer =
      response.output[0].content[0].text.value ||
      "Lo siento, no pude generar una respuesta ahora.";

    res.json({ reply: answer });
  } catch (err) {
    console.error("Error CROSTA:", err);
    res.status(500).json({ error: "Error comunicando con CROSTA" });
  }
});

// Ejecutar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor CROSTA funcionando en puerto " + PORT);
});
