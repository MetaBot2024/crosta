import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===================== PROMPT ESTRUCTURADO =====================
const CROSTA_PROMPT = `
Eres CROSTA, el asistente oficial de La Crosta (www.lacrosta.cl).

TU TAREA ES ESTRUCTURAR LA INFORMACIÓN, NO CALCULAR PRECIOS.
El cálculo de precios se hace SIEMPRE en el backend, con valores fijos.

PRECIOS OFICIALES (NO LOS CALCULES, SOLO ETIQUETA EL PLAN):
- Plan Básico -> 10.000 por persona.
- Plan Plus   -> 12.000 por persona.
- Plan Pro    -> 15.000 por persona.

Debes entender lo que pide el usuario y responder SIEMPRE con un JSON VÁLIDO,
sin texto adicional, con este formato EXACTO:

{
  "modo": "cotizacion" | "charla",

  "plan_recomendado": "Basico" | "Plus" | "Pro" | null,
  "razon_plan": "explica por qué ese plan",

  "personas": número o null,
  "evento": "texto" o null,
  "fecha": "texto" o null,
  "hora": "texto" o null,
  "comuna": "texto" o null,
  "nombre": "texto" o null,

  "preguntas_pendientes": "texto con las preguntas que falten por responder" o "",
  "respuesta_libre": "texto para conversar con el usuario (sin precios)"
}

REGLAS:
- Si el usuario está claramente pidiendo una COTIZACIÓN (precio, total, etc.),
  usa "modo": "cotizacion".
- Si el usuario solo conversa ("hola", "gracias", etc.), usa "modo": "charla"
  y rellena solo "respuesta_libre".
- NUNCA pongas números de precios ni totales en "respuesta_libre".
  Los precios SIEMPRE los calculará el backend.
- Si no entiendes algún dato, deja ese campo como null y explícalo en "preguntas_pendientes".
- El JSON debe ser válido. No agregues comentarios, ni texto fuera del JSON.
`;

// ===================== RUTA DE PRUEBA =====================
app.get("/", (req, res) => {
  res.send("CROSTA backend OK");
});

// ===================== ENDPOINT PRINCIPAL =====================
app.post("/chat", async (req, res) => {
  try {
    console.log("📩 /chat recibido:", req.body);

    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Formato inválido" });
    }

    // Añadimos el prompt de sistema
    const input = [{ role: "system", content: CROSTA_PROMPT }, ...messages];

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input,
    });

    console.log("✅ Respuesta OpenAI RAW:", JSON.stringify(response, null, 2));

    // Extraemos el texto bruto (que DEBE ser JSON)
    let rawText = "";
    if (response.output_text) {
      rawText = response.output_text;
    } else if (
      response.output &&
      response.output[0] &&
      response.output[0].content &&
      response.output[0].content[0] &&
      response.output[0].content[0].text &&
      response.output[0].content[0].text.value
    ) {
      rawText = response.output[0].content[0].text.value;
    }

    console.log("🧾 Texto bruto del modelo:", rawText);

    let reply = "Lo siento, no pude generar una respuesta ahora.";

    try {
      const data = JSON.parse(rawText);

      // Si el modelo decide que es conversación normal:
      if (data.modo === "charla") {
        reply = data.respuesta_libre || reply;
      } else if (data.modo === "cotizacion") {
        // ===================== AQUÍ CONTROLAMOS PRECIOS =====================
        const plan = data.plan_recomendado; // Basico | Plus | Pro
        const personas = Number(data.personas) || null;

        // Valores FIJOS
        const preciosPorPlan = {
          Basico: 10000,
          Plus: 12000,
          Pro: 15000,
        };

        let precioPersona = plan ? preciosPorPlan[plan] : null;
        let total = null;

        if (personas && precioPersona) {
          total = personas * precioPersona;
        }

        // Armamos cotización segura
        let partes = [];

        partes.push("COTIZACIÓN LA CROSTA 🍕");
        partes.push("");

        if (data.nombre) partes.push(`Cliente: ${data.nombre}`);
        if (data.evento) partes.push(`Evento: ${data.evento}`);
        if (data.fecha) partes.push(`Fecha: ${data.fecha}`);
        if (data.comuna) partes.push(`Comuna: ${data.comuna}`);
        if (personas) partes.push(`Personas: ${personas}`);
        if (data.hora) partes.push(`Hora estimada: ${data.hora}`);

        partes.push("");

        if (plan) {
          partes.push(`Plan recomendado: Plan ${plan}`);
        }
        if (data.razon_plan) {
          partes.push(data.razon_plan);
          partes.push("");
        }

        if (precioPersona) {
          partes.push(
            `Precio por persona: $${precioPersona.toLocaleString("es-CL")}`
          );
        } else {
          partes.push(
            "Precio por persona: (no definido, falta confirmar el plan)."
          );
        }

        if (total) {
          partes.push(
            `Total estimado: ${personas} personas x $${precioPersona.toLocaleString(
              "es-CL"
            )} = $${total.toLocaleString("es-CL")}`
          );
        } else {
          partes.push(
            "Total estimado: no se pudo calcular porque faltan datos (personas o plan)."
          );
        }

        partes.push("");

        if (data.preguntas_pendientes) {
          partes.push(data.preguntas_pendientes);
          partes.push("");
        }

        partes.push(
          "Si quieres, puedo dejarte un mensaje listo para enviar por WhatsApp con todos los datos de tu evento."
        );

        reply = partes.join("\n");
      } else {
        // Si el modelo manda algo raro, devolvemos el texto bruto
        reply = rawText;
      }
    } catch (e) {
      console.error("❌ Error parseando JSON del modelo:", e);
      reply = rawText || reply;
    }

    console.log("📝 Enviando al cliente:", reply);

    return res.json({ reply });
  } catch (err) {
    console.error("❌ ERROR GENERAL CROSTA:", err.response?.data || err.message);
    return res.status(500).json({ error: "Error con CROSTA" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor CROSTA funcionando en puerto " + PORT);
});
