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

// ===================== AGENDA MANUAL =====================
// Fechas ya reservadas (formato YYYY-MM-DD)
// Cuando cierres un evento, agrega la fecha aquí y vuelve a hacer deploy.
const FECHAS_OCUPADAS = [
  // "2025-01-10",
  // "2025-01-15",
];

function estaFechaOcupada(fechaISO) {
  if (!fechaISO) return false;
  return FECHAS_OCUPADAS.includes(fechaISO.trim());
}

// ===================== PROMPT ESTRUCTURADO =====================
const CROSTA_PROMPT = `
Eres CROSTA, el asistente oficial de La Crosta (www.lacrosta.cl).

TU TAREA PRINCIPAL:
Entender lo que necesita el cliente, recomendar el mejor plan y devolver SIEMPRE
un JSON estructurado (sin texto extra). El backend se encarga de los precios,
descuentos y disponibilidad.

PRECIOS OFICIALES (el modelo NO los calcula, solo etiqueta el plan):
- Plan Básico -> 10.000 por persona.
- Plan Plus   -> 12.000 por persona.
- Plan Pro    -> 15.000 por persona.

DESCUENTO POR PAGO COMPLETO:
Si el cliente indica que pagará el evento completo por adelantado / pago total / pago anticipado,
debes marcar "pago_completo": true en el JSON. El backend aplicará un 10% de descuento al total.
No calcules montos, solo marca el campo.

FECHA Y HORA:
- "fecha" debe ir SIEMPRE en formato YYYY-MM-DD (por ejemplo "2025-01-10").
- "hora" puede ser texto libre (ej: "18:00", "19:30", "noche", etc.).

FORMATO EXACTO DEL JSON QUE DEBES DEVOLVER (SIN TEXTO ADICIONAL):

{
  "modo": "cotizacion" | "charla",

  "plan_recomendado": "Basico" | "Plus" | "Pro" | null,
  "razon_plan": "explica por qué ese plan",

  "personas": número o null,
  "evento": "texto" o null,
  "fecha": "texto (YYYY-MM-DD)" o null,
  "hora": "texto" o null,
  "comuna": "texto" o null,
  "nombre": "texto" o null,

  "pago_completo": true | false | null,

  "preguntas_pendientes": "texto con las preguntas que falten por responder" o "",
  "respuesta_libre": "texto para conversar con el usuario (sin precios)"
}

REGLAS IMPORTANTES:
- Si el usuario pide precio, cotización, valor total, etc. -> "modo": "cotizacion".
- Si solo conversa ("hola", "gracias", etc.) -> "modo": "charla" y rellena solo "respuesta_libre".
- NO escribas montos numéricos de precios ni totales en "respuesta_libre".
- Si falta algún dato (personas, fecha, comuna, etc.), déjalo en null y explícalo en "preguntas_pendientes".
- Si el usuario dice explícitamente que pagará todo el evento al contado / pago total / pago anticipado,
  entonces "pago_completo": true.
- Si no se habla de forma de pago, usa "pago_completo": null.

INDICACIÓN IMPORTANTE SOBRE DISPONIBILIDAD:
- Tú NO accedes al calendario real. El backend revisa una agenda interna.
- Tú solo debes devolver correctamente "fecha" para que el backend pueda revisar disponibilidad.

INDICACIÓN SOBRE CIERRE:
- Al final, en "respuesta_libre" o "preguntas_pendientes" NO debes mencionar WhatsApp.
- La acción para avanzar debe ser dirigir al cliente a completar el formulario del plan recomendado
  en la página web (por ejemplo "Formulario Plan Plus en la web de La Crosta").
- El backend se encargará de mostrar el llamado a la acción hacia el formulario.
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

    const input = [{ role: "system", content: CROSTA_PROMPT }, ...messages];

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input,
    });

    console.log("✅ Respuesta OpenAI RAW:", JSON.stringify(response, null, 2));

    // Extraer texto bruto (el JSON)
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

      if (data.modo === "charla") {
        // Solo conversación
        reply = data.respuesta_libre || reply;
      } else if (data.modo === "cotizacion") {
        // ===================== PRECIOS FIJOS =====================
        const plan = data.plan_recomendado; // Basico | Plus | Pro | null
        const personas = Number(data.personas) || null;

        const preciosPorPlan = {
          Basico: 10000,
          Plus: 12000,
          Pro: 15000,
        };

        let precioPersona = plan ? preciosPorPlan[plan] : null;
        let subtotal = null;

        if (personas && precioPersona) {
          subtotal = personas * precioPersona;
        }

        // ===================== DESCUENTO POR PAGO COMPLETO =====================
        const pagoCompleto = data.pago_completo === true;
        let descuento = 0;
        let totalFinal = subtotal;

        if (pagoCompleto && subtotal) {
          descuento = Math.round(subtotal * 0.1); // 10%
          totalFinal = subtotal - descuento;
        }

        // ===================== DISPONIBILIDAD (AGENDA MANUAL) =====================
        let disponibilidadTexto = "";
        if (data.fecha) {
          const ocupada = estaFechaOcupada(data.fecha);
          if (ocupada) {
            disponibilidadTexto =
              "⚠️ Importante: esa fecha ya aparece como reservada en nuestra agenda interna. Podemos revisar otro horario o día para tu evento.";
          } else {
            disponibilidadTexto =
              "✅ En nuestra agenda manual esa fecha no aparece bloqueada. De todas formas, la reserva queda sujeta a confirmación final.";
          }
        }

        // ===================== ARMAR COTIZACIÓN =====================
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

        if (subtotal) {
          partes.push(
            `Subtotal: ${personas} personas x $${precioPersona.toLocaleString(
              "es-CL"
            )} = $${subtotal.toLocaleString("es-CL")}`
          );
        }

        if (pagoCompleto && subtotal) {
          partes.push(
            `Descuento por pago total anticipado (10%): -$${descuento.toLocaleString(
              "es-CL"
            )}`
          );
        }

        if (totalFinal) {
          partes.push(
            `Total a pagar: $${totalFinal.toLocaleString("es-CL")}`
          );
        } else {
          partes.push(
            "Total a pagar: no se pudo calcular porque faltan datos (personas o plan)."
          );
        }

        partes.push("");

        if (pagoCompleto) {
          partes.push(
            "Forma de pago considerada: Pago total anticipado (contado), con 10% de descuento aplicado."
          );
        } else {
          partes.push(
            "Si deseas pagar el evento completo por adelantado, puedes acceder a un 10% de descuento sobre el total."
          );
        }

        if (disponibilidadTexto) {
          partes.push("");
          partes.push(disponibilidadTexto);
        }

        partes.push("");

        if (data.preguntas_pendientes) {
          partes.push(data.preguntas_pendientes);
          partes.push("");
        }

        // 👉 CIERRE: dirigir al formulario según el plan
        if (plan) {
          partes.push(
            `Para avanzar con la reserva, completa el formulario del Plan ${plan} en la página web de La Crosta.`
          );
        } else {
          partes.push(
            "Para avanzar con la reserva, completa el formulario del plan que más se ajuste a tu evento en la página web de La Crosta."
          );
        }

        reply = partes.join("\n");
      } else {
        // Si el modelo devuelve algo raro, devolvemos el texto tal cual
        reply = rawText || reply;
      }
    } catch (e) {
      console.error("❌ Error parseando JSON del modelo:", e);
      reply = rawText || reply;
    }

    console.log("📝 Enviando al cliente:", reply);

    return res.json({ reply });
  } catch (err) {
    console.error(
      "❌ ERROR GENERAL CROSTA:",
      err.response?.data || err.message
    );
    return res.status(500).json({ error: "Error con CROSTA" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor CROSTA funcionando en puerto " + PORT);
});
