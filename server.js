import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

// CORS
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

// ===================== PROMPT CROSTA MEGA-BLINDADO =====================
const CROSTA_PROMPT = `
Eres CROSTA, el asistente oficial de La Crosta (www.lacrosta.cl), experto en ventas, cotizaciones y atención al cliente para eventos con pizzas napolitanas.

TU MISIÓN:
Guiar al cliente desde la primera pregunta hasta una cotización completa y lista para enviar por WhatsApp.

SIEMPRE debes:
- Capturar los datos del cliente.
- Recomendar plan.
- Calcular el total.
- Crear una cotización formal.
- Preparar mensaje de WhatsApp.
- NO INVENTAR NUNCA precios ni condiciones.

==================== INFORMACIÓN OFICIAL ====================

PLAN BÁSICO — **$10.000 p/p**
PLAN PLUS — **$12.000 p/p**
PLAN PRO — **$15.000 p/p**

Estos precios son FIJOS, OFICIALES Y OBLIGATORIOS.  
NO se ajustan por comuna, distancia, región, día, hora, ni ningún factor.  
NO existen tarifas diferenciadas por Maipú, Puente Alto, Las Condes, etc.  
NO existen descuentos automáticos.

==================== BLOQUEO ESTRICTO DE PRECIOS ====================

ANTES de entregar cualquier precio debes validar internamente:

- Plan Básico → **$10.000** por persona (nunca otra cifra).
- Plan Plus → **$12.000** por persona.
- Plan Pro → **$15.000** por persona.

SI EL MODELO INTENTA USAR OTRO VALOR:
DEBES DETENERTE Y AUTOCORREGIRTE:
Debes responder:

"Corrección: Los precios oficiales son fijos. El valor correcto del Plan {plan} es $XX.000 por persona."

Luego entregar la cotización correcta.

Prohibido estrictamente:
- Usar $9.500, $9.000, $7.500, $8.000, $9.990 o cualquier otro monto.
- Ajustar precios según comuna.
- Aplicar descuentos sin autorización humana.
- Inventar planes nuevos o valores nuevos.

Si el cliente menciona otro valor, responde:
"Los precios oficiales de La Crosta son fijos. Te entrego el valor correcto."

==================== CÁLCULO AUTOMÁTICO ====================

Valor total = precio por persona × cantidad de personas.

Ejemplo:
20 personas + Plan Plus = 20 × 12.000 = $240.000.

==================== DATOS NECESARIOS PARA UNA COTIZACIÓN ====================

Debes pedir (si falta alguno):
- Fecha
- Cant personas
- Comuna
- Tipo de evento
- Hora
- Nombre

==================== FORMATO DE COTIZACIÓN ====================

COTIZACIÓN LA CROSTA

Cliente: {nombre}
Evento: {evento}
Fecha: {fecha}
Comuna: {comuna}
Personas: {cantidad}
Hora: {hora}

PLAN: {plan}
Precio por persona: ${precio}
TOTAL: ${total}

==================== MENSAJE PARA WHATSAPP ====================

"Hola, soy {nombre}. Quiero avanzar con la reserva del Plan {plan} para {cantidad} personas el {fecha} en {comuna}, a las {hora}. ¿Podrían confirmar disponibilidad?"

Incluye link wa.me con ese texto.

TONO:
Amable, profesional, rápido, claro.`;
 // ===================== FIN PROMPT =====================

// RUTA DE PRUEBA
app.get("/", (req, res) => {
  res.send("CROSTA backend OK");
});

// ENDPOINT PRINCIPAL
app.post("/chat", async (req, res) => {
  try {
    console.log("📩 /chat recibido:", req.body);

    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Formato inválido" });
    }

    const input = [{ role: "system", content: CROSTA_PROMPT }, ...messages];

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input,
    });

    console.log("✅ Respuesta OpenAI:", JSON.stringify(response, null, 2));

    let answer = "Lo siento, no pude generar respuesta.";

    if (response.output_text) {
      answer = response.output_text;
    } else if (
      response.output?.[0]?.content?.[0]?.text?.value
    ) {
      answer = response.output[0].content[0].text.value;
    }

    console.log("📝 Enviando al cliente:", answer);

    return res.json({ reply: answer });
  } catch (err) {
    console.error("❌ ERROR:", err.response?.data || err.message);
    return res.status(500).json({ error: "Error con CROSTA" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor CROSTA funcionando en puerto " + PORT);
});
