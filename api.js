/* ─────────────────────────────────────────────────────────
   api.js — Consumo de la API de SECOP II (Socrata)
───────────────────────────────────────────────────────── */
'use strict';

const SecopAPI = (() => {
    // URL Base del Dataset del SECOP II en Datos Abiertos Colombia
    // Documentación: https://www.datos.gov.co/Gastos-Gubernamentales/SECOP-II-Contratos-Electr-nicos/jbjy-vk9h
    const BASE_URL = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';

    /**
     * Obtiene los contratos de mayor valor para un Depto y Año
     * @param {string} departamento Ej: 'Bogotá D.C.'
     * @param {string} year Ej: '2023'
     * @param {number} limit Maximo de resultados
     */
    async function fetchTopContracts(departamento, year, limit = 100) {
        const cacheKey = `${departamento}_${year}_${limit}`;

        // Construir consulta SoQL (Socrata Query Language)
        // Filtramos por departamento, extraemos el año de la fecha de firma y omitimos valores en 0 o vacíos.
        // OJO: SECOP tiene muchos datos "sucios", tratamos de traer los más limpios posibles.

        let deptoQuery = `departamento='${departamento}'`;
        // SECOP I y II registran a Bogotá estrictamente como "Distrito Capital de Bogotá"
        if (departamento === 'Bogotá D.C.') {
            deptoQuery = `departamento='Distrito Capital de Bogotá'`;
        }

        const query = [
            `$where=${deptoQuery} AND date_extract_y(fecha_de_firma)=${year} AND valor_del_contrato > 0`,
            `$order=valor_del_contrato DESC`,
            `$limit=${limit}`
        ].join('&');

        const url = `${BASE_URL}?${query}`;
        console.log('[API] Fetching:', url);

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const data = await response.json();

            const cleanedData = data.map(item => ({
                id: item.id_contrato || Math.random().toString(),
                entidad: item.nombre_entidad || 'Entidad Desconocida',
                contratista: item.nombre_contratista || item.proveedor_adjudicado || 'Desconocido',
                objeto: item.descripcion_del_proceso || 'Sin descripción pormenorizada.',
                valor: parseFloat(item.valor_del_contrato) || 0,
                sector: item.sector || 'N/A',
                // metadatos extra utiles para UI
                fecha: item.fecha_de_firma ? item.fecha_de_firma.split('T')[0] : 'S/F',
                urlSecop: item.urlproceso && item.urlproceso.url ? item.urlproceso.url : '#',
                diasAdicionados: parseInt(item.dias_adicionados) || 0,
                estado: item.estado_contrato || 'Desconocido',
                modalidad: item.modalidad_de_contratacion || 'No Especificada'
            }));

            return cleanedData;

        } catch (error) {
            console.error('[API] Error fetched SECOP:', error);
            throw error;
        }
    }

    /**
     * Data Demográfica simulada basada en el Censo 2018 (DANE)
     * Para calcular el gasto Per Cápita.
     */
    async function fetchPopulation(departamento) {
        // Simulamos latencia de una API
        await new Promise(res => setTimeout(res, 300));

        const popMap = {
            'Bogotá D.C.': 7900000,
            'Antioquia': 6600000,
            'Valle del Cauca': 4500000,
            'Atlántico': 2700000,
            'Santander': 2200000,
            'Cundinamarca': 3200000
        };
        return popMap[departamento] || 1000000; // Default 1M
    }

    return {
        fetchTopContracts,
        fetchPopulation
    };
})();
