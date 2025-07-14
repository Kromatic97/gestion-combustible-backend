const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config(); // Cargar variables del archivo .env

const app = express();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

app.use(express.json());
app.use(cors());

/* ============================
   GET: Vehículos
=============================== */
app.get('/api/vehiculos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Vehiculo');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener vehículos:', error);
    res.status(500).json({ error: 'Error al obtener vehículos' });
  }
});

/* ============================
   GET: Choferes
=============================== */
app.get('/api/choferes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Chofer');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener choferes:', error);
    res.status(500).json({ error: 'Error al obtener choferes' });
  }
});

/* ============================
   GET: Lugares
=============================== */
app.get('/api/lugares', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Lugar');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener lugares:', error);
    res.status(500).json({ error: 'Error al obtener lugares' });
  }
});



/* ============================
   GET: Abastecimientos (últimos 20)
=============================== */
app.get('/api/abastecimientos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.*,
        v.Denominacion AS Vehiculo,
        c.nombre AS Chofer,
        l.NombreLugar AS Lugar
      FROM Abastecimiento a
      JOIN Vehiculo v ON v.VehiculoID = a.VehiculoID
      JOIN Chofer c ON c.ChoferID = a.ChoferID
      JOIN Lugar l ON l.LugarID = a.LugarID
      ORDER BY a.Fecha DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener abastecimientos:', error);
    res.status(500).json({ error: 'Error al obtener abastecimientos' });
  }
});



/* ============================
   GET: Stock actual
=============================== */
app.get('/api/stock', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT LitroActual
      FROM StockCombustible
      ORDER BY FechaTransaccion DESC
      LIMIT 1
    `);
    res.json(result.rows[0] || { litroactual: 10000 });
  } catch (error) {
    console.error('Error al obtener stock:', error);
    res.status(500).json({ error: 'Error al obtener stock' });
  }
});



/* ============================
   POST: Registrar abastecimiento
=============================== */
app.post('/api/abastecimientos', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      Fecha,
      VehiculoID,
      KilometrajeActual,
      CantLitros,
      LugarID,
      ChoferID
    } = req.body;

    const fechaHora = new Date();
    const litros = Number(CantLitros);
    const kilometraje = Number(KilometrajeActual);
    if (isNaN(litros) || isNaN(kilometraje)) {
      return res.status(400).json({ error: 'Datos numéricos inválidos' });
    }

    await client.query('BEGIN');

    const resultAbast = await client.query(
      `INSERT INTO Abastecimiento (Fecha, VehiculoID, KilometrajeActual, Cant_Litros, LugarID, ChoferID)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING AbastecimientoID`,
      [fechaHora, VehiculoID, kilometraje, litros, LugarID, ChoferID]
    );

    const abastecimientoID = resultAbast.rows[0].abastecimientoid;

    const resultStock = await client.query(
      `SELECT LitroActual FROM StockCombustible ORDER BY FechaTransaccion DESC LIMIT 1`
    );

    const litroActualRaw = resultStock.rows[0]?.litroactual ?? 10000;
    const litroActual = Number(litroActualRaw);
    const nuevoStock = isNaN(litroActual) ? 10000 - litros : litroActual - litros;

    const resultNewStock = await client.query(
      `INSERT INTO StockCombustible (FechaTransaccion, LitroActual)
       VALUES ($1, $2) RETURNING StockCombustibleID`,
      [fechaHora, nuevoStock]
    );

    const nuevoStockID = resultNewStock.rows[0].stockcombustibleid;

    await client.query(
      `INSERT INTO Abastecimiento_StockCombustible (AbastecimientoID, StockCombustibleID, FechaTransaccion)
       VALUES ($1, $2, $3)`,
      [abastecimientoID, nuevoStockID, fechaHora]
    );

    await client.query('COMMIT');

    res.json({
      mensaje: 'Abastecimiento registrado correctamente',
      abastecimientoID,
      nuevoStock,
      alarma: nuevoStock <= 1500
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al registrar abastecimiento:', error);
    res.status(500).json({ error: 'Error al registrar abastecimiento' });
  } finally {
    client.release();
  }
});

// ============================
// Rutas para Selects de Vehículo
// ============================

// Obtener marcas
app.get('/api/marcas', async (req, res) => {
  try {
    const result = await pool.query('SELECT marcaid, descripcion FROM marca ORDER BY descripcion');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener marcas:', error);
    res.status(500).json({ error: 'Error al obtener marcas' });
  }
});

// Obtener modelos
app.get('/api/modelos', async (req, res) => {
  try {
    const result = await pool.query('SELECT modeloid, nombremodelo FROM modelo ORDER BY nombremodelo');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener modelos:', error);
    res.status(500).json({ error: 'Error al obtener modelos' });
  }
});

// Obtener tipos de vehículo
app.get('/api/tiposvehiculo', async (req, res) => {
  try {
    const result = await pool.query('SELECT tipovehiculoid, tipovehiculo FROM tipovehiculo ORDER BY tipovehiculo');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener tipos de vehículo:', error);
    res.status(500).json({ error: 'Error al obtener tipos de vehículo' });
  }
});


// ============================
// Registrar nuevo vehículo
// ============================
app.post('/api/vehiculos', async (req, res) => {
  const { denominacion, kilometraje, marcaid, modeloid, tipovehiculoid } = req.body;

  try {
    await pool.query(`
      INSERT INTO vehiculo (denominacion, kilometrajeodometro, marcaid, modeloid, tipovehiculoid)
      VALUES ($1, $2, $3, $4, $5)
    `, [denominacion, kilometraje, marcaid, modeloid, tipovehiculoid]);

    res.status(201).json({ mensaje: 'Vehículo registrado exitosamente' });
  } catch (error) {
    console.error('Error al registrar vehículo:', error);
    res.status(500).json({ error: 'Error al registrar vehículo' });
  }
});

// ============================
// Registrar nuevo chofer
// ============================
app.post('/api/choferes', async (req, res) => {
  const { nombre } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'Falta el nombre del chofer' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO chofer (nombre) VALUES ($1) RETURNING choferid',
      [nombre]
    );

    res.status(201).json({
      mensaje: 'Chofer registrado correctamente',
      choferID: result.rows[0].choferid
    });
  } catch (error) {
    console.error('Error al registrar chofer:', error);
    res.status(500).json({ error: 'Error al registrar chofer' });
  }
});

// ============================
// Registrar recarga de stock
// ============================
app.post('/api/recarga-stock', async (req, res) => {
  const { cantlitros, choferid, fecha } = req.body;

  if (!cantlitros || !choferid || !fecha) {
    return res.status(400).json({ error: 'Faltan datos para la recarga' });
  }

  try {
    // Registrar la recarga
    await pool.query(
      'INSERT INTO recargastock (cantlitros, choferid, fecha) VALUES ($1, $2, $3)',
      [cantlitros, choferid, fecha]
    );

    // Obtener último stock actual
    const { rows } = await pool.query(
      'SELECT litroactual FROM stockcombustible ORDER BY stockcombustibleid DESC LIMIT 1'
    );

    const ultimoStock = rows[0]?.litroactual || 0;
    const nuevoStock = parseFloat(ultimoStock) + parseFloat(cantlitros);

    // Insertar nuevo stock actualizado
    await pool.query(
      'INSERT INTO stockcombustible (fechatransaccion, litroactual) VALUES ($1, $2)',
      [fecha, nuevoStock]
    );

    res.status(201).json({ mensaje: 'Recarga registrada correctamente' });
  } catch (error) {
    console.error('Error al registrar recarga:', error);
    res.status(500).json({ error: 'Error al registrar recarga' });
  }
});

// ============================
// GET HISTORIAL
// ============================

app.get('/api/historial-stock', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH movimientos AS (
  SELECT 
    r.fecha AS fechatransaccion,
    'Recarga' AS tipo,
    '-' AS vehiculo,
    '-' AS kilometraje,
    c.nombre AS chofer,
    REPLACE(r.cantlitros, ',', '.')::numeric AS litrosentrada,
    0::numeric AS litrossalida
  FROM recargastock r
  JOIN chofer c ON r.choferid = c.choferid

  UNION ALL

  SELECT 
    a.fecha AS fechatransaccion,
    'Abastecimiento' AS tipo,
    v.denominacion AS vehiculo,
    a.kilometrajeactual::text AS kilometraje,
    c.nombre AS chofer,
    0::numeric AS litrosentrada,
    REPLACE(a.cant_litros, ',', '.')::numeric AS litrossalida
  FROM abastecimiento a
  JOIN chofer c ON a.choferid = c.choferid
  JOIN vehiculo v ON a.vehiculoid = v.vehiculoid
)

          FROM movimientos
      ORDER BY fechatransaccion;
    `);

    res.json(rows);
  } catch (error) {
    console.error('Error al cargar historial:', error);
    res.status(500).json({ error: 'Error al cargar historial' });
  }
});



/* ============================
   Iniciar servidor
=============================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});


