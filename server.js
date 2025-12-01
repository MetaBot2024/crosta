import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

// CORS para que el navegador pueda llamar al backend
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Prompt base de CROSTA
const CROSTA_PROMPT = `
Eres CROSTA, el asistente oficial de La Crosta.
Tu misión es ayudar a los clientes a:
- Entender los planes de pizzas napolitanas (Básico, Plus y Pro).
- Recomendar el mejor plan según cantidad de personas, tipo de evento, comuna, fecha y hora.
- Calcular el valor total (precio por persona x cantidad de personas).
- Generar cotizaciones claras y completas.
- Preparar un mensaje listo para enviar por WhatsApp con los datos del evento y el plan elegido.
Siempre responde en español, con tono cercano y profesional.
No inventes precios ni planes distintos a los oficiales.
`;

// Ruta simple de prueba
app.get("/", (req, res) => {
  res.send("CROSTA backend OK");
});

app.post("/chat", async (req, res) => {
  try {
    console.log("📩 /chat recibido:", req.body);

    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Formato de 'messages' inválido" });
    }

    // Agregar mensaje de sistema
    const input = [
      { role: "system", content: CROSTA_PROMPT },
      ...messages,
    ];

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input,
    });

    console.log("✅ Respuesta de OpenAI:", JSON.stringify(response, null, 2));

    // Intentar extraer el texto de varias formas
    let answer = "Lo siento, no pude generar una respuesta ahora.";
    if (response.output_text) {
      answer = response.output_text;
    } else if (
      response.output &&
      response.output[0] &&
      response.output[0].content &&
      response.output[0].content[0] &&
      response.output[0].content[0].text &&
      response.output[0].content[0].text.value
    ) {
      answer = response.output[0].content[0].text.value;
    }

    console.log("📝 Enviando al cliente:", answer);

    // 👉 AQUÍ devolvemos la respuesta al front
    return res.json({ reply: answer });

  } catch (err) {
    console.error("❌ Error CROSTA:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Error comunicando con CROSTA" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor CROSTA funcionando en puerto " + PORT);
});
