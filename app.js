/* ─────────────────────────────────────────────────────────
   app.js — Orquestador de la UI y D3.js para "Lupa Pública"
───────────────────────────────────────────────────────── */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

    /* ── DOM Elements ─────────────────────────────────────── */
    const btnFetch = document.getElementById('fetch-btn');
    const deptSelect = document.getElementById('dept-select');
    const yearSelect = document.getElementById('year-select');
    const limitSlider = document.getElementById('limit-slider');
    const limitLabel = document.getElementById('limit-label');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const initialState = document.getElementById('initial-state');
    const loader = document.getElementById('btn-loader');
    const btnText = btnFetch.querySelector('span');

    const countOdometer = document.getElementById('count-metric');
    const totalOdometer = document.getElementById('total-metric');
    const perCapitaOdometer = document.getElementById('per-capita-metric');

    const svgCanvas = d3.select('#viz-canvas');
    const tooltip = document.getElementById('tooltip');
    const ttOpenPanelBtn = document.getElementById('tt-open-panel-btn');

    // Details Panel Elements
    const detailsPanel = document.getElementById('details-panel');
    const closeDetailsBtn = document.getElementById('close-details');

    /* ── Utils ────────────────────────────────────────────── */
    const formatCurrency = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    });

    const formatShortNumber = (num) => {
        if (num >= 1e12) return (num / 1e12).toFixed(1) + ' Billones';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + ' Millones';
        return num.toLocaleString('es-CO');
    };

    /* ── D3 Bubble Chart Logic ────────────────────────────── */
    let currentSimulation = null;

    function renderBubbleChart(hierarchicalData, groupByParam) {
        const container = document.getElementById('chart-area');
        const width = container.clientWidth;
        const height = container.clientHeight;

        svgCanvas.selectAll('*').remove();

        const root = d3.hierarchy(hierarchicalData)
            .sum(d => d.valor || 0)
            .sort((a, b) => b.value - a.value);

        const pack = d3.pack()
            .size([width, height])
            .padding(10); // Espaciado extra para agrupaciones

        pack(root);

        const extent = d3.extent(currentDataSet, d => d.valor);
        const colorScale = d3.scaleLog()
            .domain([extent[0] || 1, extent[1]])
            .range(['#06b6d4', '#10b981']);

        // Monopoly globally map
        const contractorCounts = {};
        currentDataSet.forEach(d => {
            contractorCounts[d.contratista] = (contractorCounts[d.contratista] || 0) + 1;
        });

        let focus = root;
        let view;
        let tooltipTimeout;
        let activeContractData = null;

        // Main groups for rendering
        const gNodes = svgCanvas.append("g");

        // Bubbles
        const node = gNodes.selectAll("circle")
            .data(root.descendants().slice(1)) // Skip root
            .join("circle")
            .attr("cx", d => d.x)
            .attr("cy", d => d.y)
            .attr("class", d => {
                let cls = "node " + (d.children ? "node-group" : "node-leaf");

                // Lupa Publica Specific Alerts
                const dias = d.data.diasAdicionados || 0;
                if (dias > 30) cls += " alert-delay";

                // Monopoly Logic
                if (d.children && d.data.groupByAttr === 'contratista') {
                    if (d.children.length > 1) cls += " alert-monopoly";
                } else if (!d.children) {
                    if (contractorCounts[d.data.contratista] > 1) cls += " alert-monopoly";
                }

                return cls;
            })
            // Color logic: Group bubbles are dark glass, individuals are vibrant cyan/green
            .style("fill", d => d.children ? "rgba(30, 41, 59, 0.6)" : colorScale(d.data.valor))
            .style("stroke", d => d.children ? "var(--neon-cyan)" : null)
            .style("stroke-opacity", d => d.children ? 0.3 : null)
            .style("stroke-width", d => d.children ? "2px" : null)
            .style("cursor", d => d.children ? "zoom-in" : "pointer")
            .attr("r", 0) // start small for animation
            .transition().duration(1000)
            .attr("r", d => d.r);

        // Re-select nodes after transition to add events
        gNodes.selectAll("circle")
            .on("click", (event, d) => {
                event.stopPropagation();
                if (d.children && focus !== d) {
                    zoom(event, d);
                } else if (!d.children) {
                    openDetailsPanel(d.data);
                }
            })
            .on('mouseenter', (event, d) => {
                if (d.children) return; // Only tooltip for leaves
                clearTimeout(tooltipTimeout);
                activeContractData = d.data;
            })
            .on('mousemove', (event, d) => {
                if (d.children) return;
                const contract = d.data;
                activeContractData = contract;

                document.getElementById('tt-titulo').textContent = `ID: ${contract.id}`;
                document.getElementById('tt-entidad').textContent = contract.entidad;
                document.getElementById('tt-contratista').textContent = contract.contratista;
                document.getElementById('tt-sector').textContent = contract.sector;
                document.getElementById('tt-valor').textContent = formatCurrency.format(contract.valor);
                document.getElementById('tt-objeto').textContent = contract.objeto;

                let mouseX = event.pageX + 20;
                let mouseY = event.pageY + 20;

                const ttRect = tooltip.getBoundingClientRect();
                if (mouseX + ttRect.width > window.innerWidth) mouseX = event.pageX - ttRect.width - 20;
                if (mouseY + ttRect.height > window.innerHeight) mouseY = event.pageY - ttRect.height - 20;

                tooltip.style.left = `${mouseX}px`;
                tooltip.style.top = `${mouseY}px`;
                tooltip.style.opacity = '1';
            })
            .on('mouseleave', (event, d) => {
                if (d.children) return;
                tooltipTimeout = setTimeout(() => tooltip.style.opacity = '0', 800);
            });

        // Labels
        const labelGroup = svgCanvas.append("g");

        const label = labelGroup.selectAll("text")
            .data(root.descendants().slice(1))
            .join("text")
            .attr("x", d => d.x)
            .attr("y", d => d.y)
            .style("fill-opacity", d => d.parent === root ? 1 : 0) // Show only first level
            .style("display", d => d.parent === root ? "inline" : "none")
            .style("fill", "var(--text-main)")
            .style("font-size", "12px")
            .style("font-weight", d => d.children ? "600" : "400")
            .style("pointer-events", "none")
            .attr("text-anchor", "middle")
            .text(d => {
                if (d.children) {
                    return d.data.groupName.substring(0, Math.floor(d.r / 3)) + (d.data.groupName.length > Math.floor(d.r / 3) ? '..' : '');
                } else {
                    return d.data.entidad.substring(0, Math.floor(d.r / 4)) + (d.data.entidad.length > Math.floor(d.r / 4) ? '..' : '');
                }
            });

        // Zoom Out on Background Click
        svgCanvas.on("click", (event) => zoom(event, root));

        // Tooltip persistence
        tooltip.addEventListener('mouseenter', () => clearTimeout(tooltipTimeout));
        tooltip.addEventListener('mouseleave', () => {
            tooltipTimeout = setTimeout(() => tooltip.style.opacity = '0', 800);
        });

        // ── Details Panel Open Logic ──
        const openDetailsPanel = (c) => {
            if (!c) return;
            document.getElementById('dp-id').textContent = c.id;
            document.getElementById('dp-entidad').textContent = c.entidad;
            document.getElementById('dp-contratista').textContent = c.contratista;
            document.getElementById('dp-objeto').textContent = c.objeto;
            document.getElementById('dp-estado').textContent = c.estado;
            document.getElementById('dp-modalidad').textContent = c.modalidad;
            document.getElementById('dp-valor').textContent = formatCurrency.format(c.valor);
            document.getElementById('dp-fecha').textContent = c.fecha;
            document.getElementById('dp-retrasos').textContent = c.diasAdicionados > 0 ? `${c.diasAdicionados} Días` : 'Ninguno';
            document.getElementById('dp-secop-link').href = c.urlSecop;

            const sameContractor = currentDataSet.filter(item => item.contratista === c.contratista);
            const alertBox = document.getElementById('dp-monopoly-alert');

            if (sameContractor.length > 1) {
                const totalConcentrado = sameContractor.reduce((acc, curr) => acc + curr.valor, 0);
                document.getElementById('dp-monopoly-text').textContent =
                    `Posee ${sameContractor.length} contratos en el Top seleccionado sumando ${formatShortNumber(totalConcentrado)}.`;
                alertBox.style.display = 'block';
            } else {
                alertBox.style.display = 'none';
            }

            const flagBox = document.getElementById('dp-red-flag');
            flagBox.style.display = c.diasAdicionados > 30 ? 'block' : 'none';

            tooltip.style.opacity = '0';
            detailsPanel.classList.remove('closed');
        };

        ttOpenPanelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeContractData) openDetailsPanel(activeContractData);
        });

        // ── Zoom Function Implementation (via viewBox D3.js) ──
        // Initialize ViewBox
        let currentScale = 1;
        zoomToSvg(root, 0);

        const btnZoomOut = document.getElementById('btn-zoom-out');
        if (btnZoomOut) btnZoomOut.style.display = 'none';

        if (btnZoomOut) {
            btnZoomOut.onclick = (e) => {
                e.stopPropagation();
                zoom(e, root);
            };
        }

        function zoom(event, d) {
            focus = d;
            zoomToSvg(d, 750);

            if (btnZoomOut) {
                btnZoomOut.style.display = (focus !== root) ? 'inline-block' : 'none';
            }

            // Animating label appearance/disappearance
            label
                .filter(function (n) { return n.parent === focus || this.style.display === "inline"; })
                .transition().duration(750)
                .style("fill-opacity", n => n.parent === focus ? 1 : 0)
                .on("start", function (n) { if (n.parent === focus) this.style.display = "inline"; })
                .on("end", function (n) { if (n.parent !== focus) this.style.display = "none"; });
        }

        function zoomToSvg(d, duration) {
            const padding = Math.max(d.r * 0.1, 20); // Dynamic margin
            const vWidth = (d.r + padding) * 2;
            const vHeight = (d.r + padding) * 2;

            // Aspect ratio matching
            const scale = Math.max(vWidth / width, vHeight / height);

            const newViewBox = `${d.x - (width * scale) / 2} ${d.y - (height * scale) / 2} ${width * scale} ${height * scale}`;

            if (duration > 0) {
                svgCanvas.transition().duration(duration).attr("viewBox", newViewBox);
            } else {
                svgCanvas.attr("viewBox", newViewBox);
            }
        }

        const resizeObs = new ResizeObserver(() => {
            // Redraw could be implemented here
        });
        resizeObs.observe(container);
    }

    /* ── Details Panel Actions ── */
    closeDetailsBtn.addEventListener('click', () => {
        detailsPanel.classList.add('closed');
    });

    /* ── Main Action Logic ────────────────────────────────── */

    // Update label dynamically when slider moves
    limitSlider.addEventListener('input', (e) => {
        limitLabel.textContent = e.target.value;
        const warning = document.getElementById('slider-warning');
        if (parseInt(e.target.value, 10) > 1000) {
            warning.style.display = 'block';
        } else {
            warning.style.display = 'none';
        }
    });

    let currentDataSet = [];

    // Helper: Build hierarchy based on grouping selection
    function processDataForD3(data, groupByParam) {
        if (groupByParam === 'none') {
            return { id: "root", children: data };
        }

        // Use d3.group to nest the array
        const grouped = d3.group(data, d => d[groupByParam]);
        const children = Array.from(grouped, ([key, values]) => {
            return {
                isGroup: true,
                groupName: key,
                groupByAttr: groupByParam,
                diasAdicionados: d3.max(values, d => d.diasAdicionados), // propagate worst delay for UI alerts
                children: values
            };
        });

        return { id: "root", children: children };
    }

    btnFetch.addEventListener('click', async () => {
        const depto = deptSelect.value;
        const year = yearSelect.value;
        const limitReq = parseInt(limitSlider.value, 10);
        const groupByParam = document.getElementById('grouping-axis').value;

        // UI Feedback
        initialState.style.opacity = '0';
        btnText.style.display = 'none';
        loader.style.display = 'block';
        btnFetch.disabled = true;

        try {
            // Fetch contracts and demographics concurrently
            const [data, population] = await Promise.all([
                SecopAPI.fetchTopContracts(depto, year, limitReq),
                SecopAPI.fetchPopulation(depto)
            ]);

            currentDataSet = data;

            if (data.length === 0) {
                alert(`No se encontraron contratos para ${depto} en ${year}.`);
                exportCsvBtn.style.display = 'none';
                perCapitaOdometer.textContent = '$0';
            } else {
                // Update Metrics (Animated odometers visually just setting text for now)
                countOdometer.textContent = data.length.toLocaleString();
                const totalCop = data.reduce((acc, curr) => acc + curr.valor, 0);
                totalOdometer.textContent = formatShortNumber(totalCop); // Ej: $4.5 Billones

                // Demographic Per-Capita Math
                const perCapita = totalCop / population;
                perCapitaOdometer.textContent = formatCurrency.format(perCapita);

                exportCsvBtn.style.display = 'flex';

                // Render Viz with new V4 grouping support
                const hierarchicalData = processDataForD3(data, groupByParam);
                renderBubbleChart(hierarchicalData, groupByParam);
            }

        } catch (error) {
            console.error(error);
            alert("Error al obtener datos. Revisa la consola o intenta más tarde.");
        } finally {
            // Restore UI
            btnText.style.display = 'block';
            loader.style.display = 'none';
            btnFetch.disabled = false;
        }
    });

    /* ── CSV Export Logic ─────────────────────────────────── */
    exportCsvBtn.addEventListener('click', () => {
        if (!currentDataSet || currentDataSet.length === 0) return;

        // Create CSV Header
        const headers = ["ID Contrato", "Entidad", "Contratista", "Sector", "Valor Original (COP)", "Objeto", "Fecha de Firma", "URL SECOP"];

        const rows = currentDataSet.map(c => [
            `"${c.id.replace(/"/g, '""')}"`,
            `"${c.entidad.replace(/"/g, '""')}"`,
            `"${c.contratista.replace(/"/g, '""')}"`,
            `"${c.sector.replace(/"/g, '""')}"`,
            c.valor,
            `"${c.objeto.replace(/"/g, '""').replace(/\n/g, ' ')}"`,
            `"${c.fecha}"`,
            `"${c.urlSecop}"`
        ]);

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

        // Add BOM for Excel UTF-8 reading
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `lupa_publica_export_${deptSelect.value}_${yearSelect.value}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

});
