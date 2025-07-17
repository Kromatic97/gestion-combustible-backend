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
   if (result.rows.length === 0) {
  return res.status(404).json({ error: 'No hay registros de stock aún.' });
}
res.json(result.rows[0]);
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
      alarma: nuevoStock <= 500
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
// GET HISTORICO
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
          r.cantlitros AS litrosentrada,
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
          a.cant_litros AS litrossalida
        FROM abastecimiento a
        JOIN chofer c ON a.choferid = c.choferid
        JOIN vehiculo v ON a.vehiculoid = v.vehiculoid
      )

      SELECT 
        fechatransaccion,
        tipo,
        vehiculo,
        kilometraje,
        chofer,
        litrosentrada,
        litrossalida,
        SUM(litrosentrada - litrossalida) OVER (
          ORDER BY fechatransaccion 
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS stock
      FROM movimientos
      ORDER BY fechatransaccion;
    `);

    res.json(rows);
  } catch (error) {
    console.error('Error al cargar historial:', error);
    res.status(500).json({ error: 'Error al cargar historial' });
  }
});




// ============================
// GET HISTORIAL FILTRADO
// ============================

app.get('/api/historial-stock-filtrado', async (req, res) => {
  const { choferid, vehiculoid } = req.query;

  try {
    const { rows } = await pool.query(`
      WITH movimientos AS (
        SELECT 
          r.fecha AS fechatransaccion,
          'Recarga' AS tipo,
          '-' AS vehiculo,
          '-' AS kilometraje,
          c.nombre AS chofer,
          r.cantlitros AS litrosentrada,
          0::numeric AS litrossalida,
          c.choferid,
          NULL::int AS vehiculoid
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
          a.cant_litros AS litrossalida,
          c.choferid,
          v.vehiculoid
        FROM abastecimiento a
        JOIN chofer c ON a.choferid = c.choferid
        JOIN vehiculo v ON a.vehiculoid = v.vehiculoid
      )

      SELECT 
        fechatransaccion,
        tipo,
        vehiculo,
        kilometraje,
        chofer,
        litrosentrada,
        litrossalida,
        SUM(litrosentrada - litrossalida) OVER (ORDER BY fechatransaccion) AS stock
      FROM movimientos
      WHERE 
        ($1::int IS NULL OR choferid = $1::int)
        AND ($2::int IS NULL OR vehiculoid = $2::int)
      ORDER BY fechatransaccion;
    `, [choferid || null, vehiculoid || null]);

    res.json(rows);
  } catch (error) {
    console.error('Error al cargar historial filtrado:', error);
    res.status(500).json({ error: 'Error al cargar historial filtrado' });
  }
});

// ============================
// GET: Abastecimientos por rango de fechas
// ============================
app.get('/api/abastecimientos-rango', async (req, res) => {
  const { desde, hasta } = req.query;

  if (!desde || !hasta) {
    return res.status(400).json({ error: 'Parámetros desde y hasta son requeridos' });
  }

  try {
    const result = await pool.query(`
      SELECT 
        a.*,
        v.Denominacion AS vehiculo,
        c.Nombre AS chofer,
        l.NombreLugar AS lugar
      FROM Abastecimiento a
      JOIN Vehiculo v ON v.VehiculoID = a.VehiculoID
      JOIN Chofer c ON c.ChoferID = a.ChoferID
      JOIN Lugar l ON l.LugarID = a.LugarID
      WHERE a.Fecha BETWEEN $1 AND $2
      ORDER BY a.Fecha
    `, [desde, hasta]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener abastecimientos por fecha:', error);
    res.status(500).json({ error: 'Error al obtener abastecimientos por fecha' });
  }
});

// ============================
// GET: Top 10 vehículos del mes
// ============================
app.get('/api/dashboard/top-vehiculos', async (req, res) => {
  const { anio, mes } = req.query;

  if (!anio || !mes) {
    return res.status(400).json({ error: 'Se requieren los parámetros anio y mes' });
  }

  try {
    const result = await pool.query(`
      SELECT 
        v.Denominacion AS vehiculo,
        SUM(a.cant_litros) AS litros_total
      FROM Abastecimiento a
      JOIN Vehiculo v ON v.VehiculoID = a.VehiculoID
      WHERE a.Fecha >= make_date($1, $2, 1)
        AND a.Fecha < make_date($1, $2, 1) + interval '1 month'
      GROUP BY v.Denominacion
      ORDER BY litros_total DESC
      LIMIT 10
    `, [anio, mes]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error en top-vehiculos:', error);
    res.status(500).json({ error: 'Error al obtener los vehículos que más cargaron' });
  }
});


// ============================
// GET: Total de litros cargados este mes
// ============================
app.get('/api/dashboard/total-litros-mes', async (req, res) => {
  const { anio, mes } = req.query;

  if (!anio || !mes) {
    return res.status(400).json({ error: 'Se requieren los parámetros anio y mes' });
  }

  try {
    const result = await pool.query(`
      SELECT SUM(a.cant_litros)::numeric(10,2) AS total_litros
      FROM Abastecimiento a
      WHERE a.Fecha >= make_date($1, $2, 1)
        AND a.Fecha < make_date($1, $2, 1) + interval '1 month'
    `, [anio, mes]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en total-litros-mes:', error);
    res.status(500).json({ error: 'Error al calcular litros totales del mes' });
  }
});


// ============================
// GET: Consumo diario del mes
// ============================
app.get('/api/dashboard/consumo-diario', async (req, res) => {
  const { anio, mes } = req.query;

  if (!anio || !mes) {
    return res.status(400).json({ error: 'Se requieren los parámetros anio y mes' });
  }

  try {
    const result = await pool.query(`
      SELECT 
        TO_CHAR(a.Fecha, 'YYYY-MM-DD') AS dia,
        SUM(a.cant_litros)::numeric(10,2) AS litros
      FROM Abastecimiento a
      WHERE a.Fecha >= make_date($1, $2, 1)
        AND a.Fecha < make_date($1, $2, 1) + interval '1 month'
      GROUP BY dia
      ORDER BY dia
    `, [anio, mes]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error en consumo-diario:', error);
    res.status(500).json({ error: 'Error al obtener consumo diario' });
  }
});


// ============================
// GET: Chofer que más abasteció este mes
// ============================
app.get('/api/dashboard/top-chofer', async (req, res) => {
  const { anio, mes } = req.query;

  if (!anio || !mes) {
    return res.status(400).json({ error: 'Se requieren los parámetros anio y mes' });
  }

  try {
    const result = await pool.query(`
      SELECT 
        c.Nombre AS chofer,
        SUM(a.cant_litros)::numeric(10,2) AS litros_total
      FROM Abastecimiento a
      JOIN Chofer c ON c.ChoferID = a.ChoferID
      WHERE a.Fecha >= make_date($1, $2, 1)
        AND a.Fecha < make_date($1, $2, 1) + interval '1 month'
      GROUP BY c.Nombre
      ORDER BY litros_total DESC
      LIMIT 1
    `, [anio, mes]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en top-chofer:', error);
    res.status(500).json({ error: 'Error al obtener chofer que más abasteció' });
  }
});






/* ============================
   Iniciar servidor
=============================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});


