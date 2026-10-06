-- =====================================================================
--  LIMPIA EL PARCHE (LEP-BOG) - Base de datos MySQL 8
--  UNIMINUTO - Ingeniería de Software - NRC 10-84957
--  Ejecutar en MySQL Workbench / phpMyAdmin / consola:  SOURCE 01_esquema.sql;
-- =====================================================================

DROP DATABASE IF EXISTS limpia_el_parche;
CREATE DATABASE limpia_el_parche
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE limpia_el_parche;

-- ---------------------------------------------------------------------
-- USUARIO  (clase Usuario del diagrama de clases)
-- Los ciudadanos pueden reportar sin cuenta (ver CC-003); la tabla se
-- usa para administradores y para ciudadanos que decidan registrarse.
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
  id_usuario          INT AUTO_INCREMENT PRIMARY KEY,
  nombre_completo     VARCHAR(120) NOT NULL,
  correo_electronico  VARCHAR(120) NOT NULL UNIQUE,
  telefono            VARCHAR(20),
  direccion           VARCHAR(150),
  password_hash       VARCHAR(100) NOT NULL,              -- bcrypt (RNF-002)
  rol                 ENUM('CIUDADANO','ADMINISTRADOR') NOT NULL DEFAULT 'CIUDADANO',
  estado              ENUM('ACTIVO','INACTIVO','BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  intentos_fallidos   TINYINT NOT NULL DEFAULT 0,          -- bloqueo tras 5 intentos
  bloqueado_hasta     DATETIME NULL,
  fecha_registro      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ADMINISTRADOR  (especialización de Usuario)
-- ---------------------------------------------------------------------
CREATE TABLE administrador (
  id_usuario        INT PRIMARY KEY,
  area_asignada     VARCHAR(80),
  fecha_asignacion  DATE,
  nivel_permisos    ENUM('LECTURA','GESTION','TOTAL') NOT NULL DEFAULT 'GESTION',
  CONSTRAINT fk_admin_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- TIPO_RESIDUO  (catálogo, RF-002)
-- ---------------------------------------------------------------------
CREATE TABLE tipo_residuo (
  id_tipo      INT AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(60)  NOT NULL UNIQUE,
  descripcion  VARCHAR(200),
  orden        TINYINT NOT NULL DEFAULT 0,
  activo       TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- REPORTE  (clase Reporte, RF-002 a RF-006)
-- ---------------------------------------------------------------------
CREATE TABLE reporte (
  id_reporte           INT AUTO_INCREMENT PRIMARY KEY,
  codigo_unico         VARCHAR(20)  NOT NULL UNIQUE,      -- LEP-AAAAMMDD-XXXX (RF-006)
  id_usuario           INT NULL,
  id_tipo              INT NOT NULL,
  descripcion          VARCHAR(500) NOT NULL,
  latitud              DECIMAL(9,6) NOT NULL,             -- RF-003
  longitud             DECIMAL(9,6) NOT NULL,
  direccion_texto      VARCHAR(255),
  localidad            VARCHAR(60),
  imagen_url           VARCHAR(255),                      -- RF-004 (opcional)
  estado_reporte       ENUM('PENDIENTE','EN_REVISION','ATENDIDO','RECHAZADO')
                       NOT NULL DEFAULT 'PENDIENTE',
  ip_origen            VARCHAR(45),                       -- control anti-spam (R6)
  fecha_hora           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion  DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reporte_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  CONSTRAINT fk_reporte_tipo FOREIGN KEY (id_tipo)
    REFERENCES tipo_residuo(id_tipo),
  CONSTRAINT chk_lat CHECK (latitud  BETWEEN -90  AND 90),
  CONSTRAINT chk_lng CHECK (longitud BETWEEN -180 AND 180),
  INDEX idx_reporte_coord  (latitud, longitud),
  INDEX idx_reporte_estado (estado_reporte),
  INDEX idx_reporte_fecha  (fecha_hora),
  INDEX idx_reporte_ip     (ip_origen, fecha_hora)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- MAPA_CALOR  (clase MapaDeCalor: registro de cortes generados)
-- ---------------------------------------------------------------------
CREATE TABLE mapa_calor (
  id_mapa           INT AUTO_INCREMENT PRIMARY KEY,
  fecha_generacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo_filtro       VARCHAR(30) NOT NULL DEFAULT 'TODOS',
  zoom_level        TINYINT NOT NULL DEFAULT 12,
  total_puntos      INT NOT NULL DEFAULT 0,
  id_usuario        INT NULL,
  CONSTRAINT fk_mapa_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuario(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- LOG_AUDITORIA  (R5 - ISO/IEC 27001:2022 control 8.15 Registro)
-- ---------------------------------------------------------------------
CREATE TABLE log_auditoria (
  id_log      BIGINT AUTO_INCREMENT PRIMARY KEY,
  id_usuario  INT NULL,
  accion      VARCHAR(40)  NOT NULL,
  entidad     VARCHAR(40)  NOT NULL,
  id_entidad  VARCHAR(40),
  detalle     VARCHAR(500),
  ip          VARCHAR(45),
  fecha       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  INDEX idx_log_fecha (fecha)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- VISTAS de apoyo para el panel administrativo
-- ---------------------------------------------------------------------
CREATE VIEW v_reportes_detalle AS
SELECT r.id_reporte, r.codigo_unico, t.nombre AS tipo_residuo, r.descripcion,
       r.latitud, r.longitud, r.direccion_texto, r.localidad, r.imagen_url,
       r.estado_reporte, r.fecha_hora
FROM reporte r
JOIN tipo_residuo t ON t.id_tipo = r.id_tipo;

CREATE VIEW v_reportes_por_localidad AS
SELECT COALESCE(localidad,'Sin localidad') AS localidad, COUNT(*) AS total
FROM reporte
WHERE estado_reporte <> 'RECHAZADO'
GROUP BY COALESCE(localidad,'Sin localidad')
ORDER BY total DESC;

-- ---------------------------------------------------------------------
-- CATÁLOGO INICIAL
-- ---------------------------------------------------------------------
INSERT INTO tipo_residuo (nombre, descripcion, orden) VALUES
 ('Basuras Domesticas',  'Residuos domésticos ordinarios (bolsas de basura)', 1),
 ('Reciclables',      'Plástico, cartón, vidrio y metal',                 2),
 ('Escombros',        'Residuos de construcción y demolición',            3),
 ('Voluminosos',      'Muebles, colchones, electrodomésticos',            4),
 ('Orgánicos',        'Restos de comida y residuos de poda',              5),
 ('Peligrosos',       'Pilas, aceites, químicos, residuos hospitalarios', 6),
 ('Otros',            'Residuos que no encajan en las categorías',        7);
