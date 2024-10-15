const symbols = ['AL30', 'AL30D','GD30', 'GD30D','AE38', 'AE38D','AL30C', 'AL35','AL35D', 'GD30C','GD35', 'GD35D','MERVAL', 'TX26','TX28'];
const symbol = symbols.map(s => s + '.csv');
const promises = symbol.map(file => loadCSV(`/ratios-argy/${file}`));
const legendElement = document.getElementById('legend');
const suggestions = document.getElementById('suggestions');

// Inicialización del gráfico y series
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
    width: window.innerWidth * 0.7 - 40,
    height: 500,
    grid: { horzLines: { visible: false }, vertLines: { visible: false } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
});

// Definición de series
const candleSeries = chart.addCandlestickSeries({
    upColor: '#4fff00',
    downColor: '#ff4976',
    borderVisible: false,
    wickUpColor: '#4fff00',
    wickDownColor: '#ff4976',
});
const lineSeries = chart.addLineSeries({ color: '#2196F3' });
const divisionSeries = chart.addLineSeries({ color: '#2196F3' });
const upperBandSeries = chart.addLineSeries({ color: '#000000', lineWidth: 2 });
const lowerBandSeries = chart.addLineSeries({ color: '#000000', lineWidth: 2 });
const movingAverageSeries = chart.addLineSeries({ color: '#FFA500', lineWidth: 2 });
const volumeSeries = chart.addHistogramSeries({
    color: '#26a69a',
    
    priceFormat: {
        type: 'volume',
    },
    priceScaleId: '', // set as an overlay by setting a blank priceScaleId
    // set the positioning of the volume series
  
});

volumeSeries.priceScale().applyOptions({
    scaleMargins: {
        top: 0.83, // highest point of the series will be 70% away from the top
        bottom: 0,
    },
});
const tooltip = document.getElementById('tooltip');



let bandsVisible = false;
let upperBandData = [];
let lowerBandData = [];
let movingAverageData = [];
let selectedInstrument = null;
let initialPrice = null;
let isMeasuring = false; // Para saber si estamos midiendo el cambio porcentual
let isShiftPressed = false;
let highlightedIndex = -1; // Índice de la sugerencia resaltada
let currentInput = ''; // Variable para guardar el valor actual
let firstSuggestionConfirmed = false;
let isLineChart = false; // Variable para rastrear el tipo de gráfico actual
let formattedData = []; // Definición global
let ratioData = []; // Definición global
let valorCierre = null; // Variable global para almacenar el valor de cierre



document.getElementById('toggle-chart').addEventListener('click', toggleChartType);




// Carga un archivo CSV desde una ruta
function loadCSV(filePath) {
    return fetch(filePath)
        .then(response => {
            if (!response.ok) throw new Error('Error al cargar archivo CSV');
            return response.text();
        })
        .then(data => {
            return parseCSV(data); // Función para procesar y convertir el CSV a un formato útil
        });
}

async function fetchAndUpdateChartData(symbol) {
    try {
        const response = await fetch(`/ratios-argy/${symbol}`); // Cambia la URL según la ubicación de tus archivos CSV
        
        if (!response.ok) {
            throw new Error(`Error al cargar los datos del símbolo: ${symbol}. Respuesta del servidor: ${response.statusText}`);
        }

        const data = await response.text(); // Cambia a text() ya que vamos a leer un CSV
        const rows = data.split('\n').slice(1).map(row => {
            const items = row.split(',').map(item => item.trim()); // Elimina espacios en blanco
            
            // Ignorar filas que no tienen suficientes datos
            if (items.length < 7 || items.every(item => item === '')) {
                return null; // Retorna null si la fila es vacía o no tiene suficientes datos
            }

            const [especie, fecha, apertura, maximo, minimo, cierre, volumen] = items;

            // Verifica si los campos esenciales son válidos
            if (!especie || !fecha || !apertura || !maximo || !minimo || !cierre || !volumen) {
                console.error("Datos no válidos para:", { especie, fecha, apertura, maximo, minimo, cierre, volumen });
                return null; // Retorna null si hay datos no válidos
            }

            return { 
                especie, 
                fecha, // La fecha ya está limpia de espacios
                apertura: parseFloat(apertura), 
                maximo: parseFloat(maximo), 
                minimo: parseFloat(minimo), 
                cierre: parseFloat(cierre), 
                volumen: parseInt(volumen), 
            };
        }).filter(item => item !== null); // Filtra las filas que son null

        if (rows.length === 0) {
            console.warn("No se encontraron datos válidos.");
            return; // Salir si no hay datos válidos
        }
        
        // Continuar con el procesamiento si hay datos válidos
        formattedData = rows.map(item => {
            const time = formatDate(item.fecha); // Usamos la fecha sin convertir
            const open = item.apertura;
            const high = item.maximo;
            const low = item.minimo;
            const close = item.cierre;
            const volume = item.volumen;
            
        
            return {
                time: time, // La fecha en formato "YYYY-MM-DD"
                open: open,
                high: high,
                low: low,
                close: close,
                volume: volume // Agrega volumen si es necesario
            };
        });
        
        // Asigna el cierre del penúltimo día
        if (rows.length >= 2) {
            valorCierre = rows[rows.length - 2].cierre; // Cierre del penúltimo dato
            console.log("El cierre del penúltimo día es:", valorCierre);
        } else {
            console.warn("No hay suficientes datos para obtener el cierre del penúltimo día.");
        }
        
        // Aquí solo actualiza los datos sin restablecer el gráfico
        if (!isLineChart) {
            candleSeries.setData(formattedData); // Solo si es gráfico de velas
        } else {
            const lineData = convertCandleToLineSeries(formattedData);
            lineSeries.setData(lineData); // Actualiza línea si ya es gráfico de línea
        }
        
        const volumeData = rows.map(item => ({
            time: item.fecha,
            value: item.volumen,
            color: item.cierre >= item.apertura ? '#4fff00' : '#ff4976',
        }));

        volumeSeries.setData(volumeData);

        // Calcular las bandas de Bollinger y la media móvil
        const { bands, movingAverage } = calculateBollingerBands(
            formattedData.map(result => ({
                fecha: result.time,
                cierre: result.close
            }))
        );

        // Actualizar las bandas globalmente
        upperBandData = bands.map(b => ({ time: b.time, value: b.upper }));
        lowerBandData = bands.map(b => ({ time: b.time, value: b.lower }));
        movingAverageData = movingAverage;

        // Mostrar u ocultar las bandas de Bollinger según el estado
        updateBollingerBandsVisibility();

    } catch (error) {
        console.error(`Error al cargar los datos del símbolo: ${symbol}.`, error);
    }
}

async function fetchAndUpdateChartDataRatio(symbol1, symbol2) {
    const url1 = `/ratios-argy/${symbol1}`;
    const url2 = `/ratios-argy/${symbol2}`;

    try {
        // Cargar ambos archivos CSV de manera asíncrona
        const [csvText1, csvText2] = await Promise.all([
            fetch(url1).then(response => {
                if (!response.ok) {
                    throw new Error(`Error al cargar ${url1}`);
                }
                return response.text(); // Obtener el contenido como texto
            }),
            fetch(url2).then(response => {
                if (!response.ok) {
                    throw new Error(`Error al cargar ${url2}`);
                }
                return response.text(); // Obtener el contenido como texto
            })
        ]);

        // Procesar los CSV usando PapaParse
        const data1 = Papa.parse(csvText1, { header: true, skipEmptyLines: true }).data;
        const data2 = Papa.parse(csvText2, { header: true, skipEmptyLines: true }).data;

        if (Array.isArray(data1) && Array.isArray(data2)) {
            // Filtrar y formatear los datos de data1 (ej. AL30)
            const formattedData1 = data1.filter(item => item.fecha && item.apertura && item.maximo && item.minimo && item.cierre && item.volumen)
                .map(item => ({
                    time: item.fecha,
                    open: parseFloat(item.apertura),
                    high: parseFloat(item.maximo),
                    low: parseFloat(item.minimo),
                    close: parseFloat(item.cierre),
                    volume: parseFloat(item.volumen)
                }));

            // Filtrar y formatear los datos de data2 (ej. AL30D)
            const formattedData2 = data2.filter(item => item.fecha && item.apertura && item.maximo && item.minimo && item.cierre && item.volumen)
                .map(item => ({
                    time: item.fecha,
                    open: parseFloat(item.apertura),
                    high: parseFloat(item.maximo),
                    low: parseFloat(item.minimo),
                    close: parseFloat(item.cierre),
                    volume: parseFloat(item.volumen)
                }));

            // Crear la serie de datos para el ratio
            ratioData = formattedData1.map(item1 => {
                const item2 = formattedData2.find(item2 => item2.time === item1.time);
                if (item2) {
                    return {
                        time: item1.time,
                        open: item1.open / item2.open,
                        high: item1.high / item2.high,
                        low: item1.low / item2.low,
                        close: item1.close / item2.close
                    };
                }
                return null; // Si no hay coincidencia, devolver null
            }).filter(Boolean);

        
        
            // Aquí solo actualiza los datos sin restablecer el gráfico
            if (!isLineChart) {
                candleSeries.setData(ratioData); // Solo si es gráfico de velas
                lineSeries.setData([]); // Limpiar datos de línea
        
            } else {
                const lineDataRatio = convertCandleToLineSeries(ratioData);
                lineSeries.setData(lineDataRatio); // Actualiza línea si ya es gráfico de línea
                candleSeries.setData([]); // Limpiar datos de velas
            }
            
            // Crear una nueva serie para los volúmenes sumados
            const combinedVolumeData = formattedData1.map(item1 => {
                const item2 = formattedData2.find(item2 => item2.time === item1.time);
                if (item2) {
                    const combinedVolume = item1.volume + item2.volume;
                    const useItem1Color = item1.volume >= item2.volume;
                    const color = useItem1Color
                        ? (item1.close >= item1.open ? '#4fff00' : '#ff4976')
                        : (item2.close >= item2.open ? '#4fff00' : '#ff4976');

                    return {
                        time: item1.time,
                        value: combinedVolume,
                        color: color
                    };
                }
                return null; // Si no hay coincidencia en las fechas, ignoramos el dato
            }).filter(Boolean);

            volumeSeries.setData(combinedVolumeData);

            if (ratioData && ratioData.length > 0) {
                try {
                    const { bands, movingAverage } = calculateBollingerBands(
                        ratioData.map(result => ({
                            fecha: result.time,
                            cierre: result.close
                        }))
                    );

                    // Actualizar las bandas globalmente
                    upperBandData = bands.map(b => ({ time: b.time, value: b.upper }));
                    lowerBandData = bands.map(b => ({ time: b.time, value: b.lower }));
                    movingAverageData = movingAverage;

                } catch (error) {
                    console.error('Error al calcular las bandas de Bollinger:', error);
                }
            } else {
                console.error('ratioData está vacío o no tiene datos válidos.');
            }

            // Mostrar u ocultar las bandas de Bollinger según el estado
            updateBollingerBandsVisibility();

        } else {
            console.error('data1 o data2 no son arreglos', { data1, data2 });
        }
    } catch (error) {
        console.error('Error al cargar los datos del símbolo:', error);
    }
}


function processInput(input) {
    // Convertir la entrada del usuario a mayúsculas y eliminar espacios extra
    const instrumentToLoad = input.trim().toUpperCase();

    // Si el input contiene un "/", se asume que es un ratio
    if (instrumentToLoad.includes('/')) {
        // Separar los símbolos por "/"
        const [symbol1, symbol2] = instrumentToLoad.split('/').map(s => s.trim());

        // Retornar los símbolos como archivos con extensión .csv
        return `${symbol1}.csv/${symbol2}.csv`;
    } else {
        // Si no es un ratio, simplemente agregar la extensión .csv al símbolo
        return `${instrumentToLoad}.csv`;
    }
}

function updateSearchInput(selectedText, searchInput) {
    const parts = searchInput.value.split('/');

    if (!firstSuggestionConfirmed) {
        // Si ya hay un primer símbolo, solo agregar el segundo símbolo
        if (parts.length > 1) {
            currentInput = parts[0] + '/' + selectedText; // Mantener el primer símbolo
        } else {
            currentInput = selectedText; // Solo actualizar el primer símbolo
        }
    } else {
        // Si ya se confirmó el primer símbolo, asegurarse de que se actualice correctamente
        if (parts.length > 1) {
            currentInput = parts[0] + '/' + selectedText; // Actualizar el segundo símbolo
        } else {
            currentInput = parts[0] + '/' + selectedText; // Mantener el primer símbolo y agregar el segundo
        }
    }


    searchInput.value = currentInput;
}


function confirmFirstSuggestion(searchInput) {
    if (!firstSuggestionConfirmed) {
        firstSuggestionConfirmed = true;
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
        highlightedIndex = -1; // Reiniciar el índice destacado
        showSuggestions(''); // Mostrar nuevas sugerencias
    }
}


function processSearchInput(searchInput, suggestions) {
    const input = searchInput.value.trim();
    suggestions.innerHTML = ''; // Limpiar sugerencias anteriores
    suggestions.style.display = 'none';

    if (input.includes('/')) {
        const [symbol1, symbol2] = input.split('/').map(s => s.trim());
        if (symbol.includes(symbol1) && symbol.includes(symbol2)) { // Verifica ambos símbolos
            loadChartData(`${symbol1}/${symbol2}`);
        } else {
            console.error('Uno o ambos símbolos no existen en la lista de instrumentos.');
        }
    } else if (symbol.includes(input)) { // Solo un símbolo
        loadChartData(input);
    } else {
        console.error('El símbolo no existe en la lista de instrumentos.');
    }

    highlightedIndex = -1; // Reiniciar el índice destacado
}


// Función para formatear el volumen
function formatVolume(volume) {
    if (volume >= 1e6) {
        return (volume / 1e6).toFixed(1) + ' M'; // Volumen en millones
    } else if (volume >= 1e3) {
        return (volume / 1e3).toFixed(1) + ' K'; // Volumen en miles
    } else {
        return volume.toString(); // Volumen sin formatear
    }
}


// Función para formatear la fecha
function formatDate(date) {
    // Retorna la fecha en formato "YYYY-MM-DD"
    return date; // Simplemente devuelve la fecha como está
}
// Suscribirse al movimiento del cursor
chart.subscribeCrosshairMove(function(param) {
    // Comprobar si hay datos válidos
    if (!param || !param.seriesData || param.seriesData.size === 0) {
        // Mantener el último dato mostrado si no hay interacción
        legendElement.innerHTML = lastValidData;
        // tooltip.style.display = 'none'; // Ocultar si no hay datos
        return;
    }

    const currentPrice = candleSeries.coordinateToPrice(param.point.y);

    // Si estamos midiendo (después de Shift + Click) y tenemos un precio inicial
    if (isMeasuring && initialPrice !== null) {
        // Calcular el cambio porcentual
        const percentageChange = ((currentPrice - initialPrice) / initialPrice) * 100;

        // Mostrar y actualizar la etiqueta
        tooltip.style.display = 'block';
        tooltip.innerHTML = `
            <strong>Precio inicial:</strong> ${initialPrice.toFixed(2)} <br>
            <strong>Precio actual:</strong> ${currentPrice.toFixed(2)} <br>
            <strong>Cambio:</strong> ${percentageChange.toFixed(2)} %
        `;

        // Posicionar la etiqueta cerca del cursor
        tooltip.style.left = param.point.x + 'px';
        tooltip.style.top = param.point.y + 'px';
    }

    // Obtener los datos de las series
    const price = param.seriesData.get(candleSeries);
    const ratioData = param.seriesData.get(lineSeries);
    const volumeData = param.seriesData.get(volumeSeries);
    let totalVolume = volumeData ? volumeData.value : 0; // Almacenar volumen total

    // Manejar solo los datos del ratio
    if (ratioData) {
        const ratioValue = ratioData.value || null;

        // Preparar el contenido de la leyenda para el ratio
        const ratioLegendContent = `
            <strong>Fecha:</strong> ${formatDate(param.time)} <br>
            <strong>Cierre:</strong> ${ratioValue.toFixed(2)} <br>
            <strong>Volumen Total:</strong> ${(totalVolume / 1000000).toFixed(2)}M <br>
        `;

        // Actualizar la leyenda
        legendElement.innerHTML = ratioLegendContent;
        lastValidData = ratioLegendContent; // Guardar el último dato válido

    } else if (price) {
        // Si no hay ratio, mostrar datos del precio
        const newLegendContent = `
            <strong>Fecha:</strong> ${formatDate(param.time)} <br>
            <strong>Apertura:</strong> ${price.open.toFixed(2)} <br>
            <strong>Máximo:</strong> ${price.high.toFixed(2)} <br>
            <strong>Mínimo:</strong> ${price.low.toFixed(2)} <br>
            <strong>Cierre:</strong> ${price.close.toFixed(2)} <br>
            <strong>Volumen:</strong> ${volumeData ? formatVolume(volumeData.value) : 'N/A'} <br>
        `;

        // Actualizamos la leyenda y el último dato válido
        legendElement.innerHTML = newLegendContent;
        lastValidData = newLegendContent;
    } else {
        // Limpiar la leyenda si no hay datos
        legendElement.innerHTML = '';
    }
});

// Evento de clic para capturar el precio inicial y reiniciar la medición si es necesario
chart.subscribeClick(function(param) {
    if (isShiftPressed && param && param.seriesData.size > 0 && param.point.x !== undefined) {
        // Captura el precio inicial
        const currentPrice = candleSeries.coordinateToPrice(param.point.y);
        initialPrice = currentPrice; // Guardar el precio inicial
        isMeasuring = true; // Comenzar la medición
        console.log(`Precio inicial capturado: ${initialPrice}`);
        tooltip.style.display = 'block'; // Mostrar el tooltip
    } else if (isMeasuring) {
        // Si ya estamos midiendo y se hace clic, ocultar el tooltip y detener la medición
        isMeasuring = false;
        initialPrice = null; // Reiniciar el precio inicial
        tooltip.style.display = 'none'; // Ocultar el tooltip
        console.log('Medición finalizada');
    }
});


// Detectar cuando Shift es presionado
document.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') {
        isShiftPressed = true;
    }
});

// Detectar cuando Shift es soltado
document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
        isShiftPressed = false;
    }

});


const searchButton = document.getElementById('search-button');
const searchInput = document.getElementById('search-input');


// Selecciona el campo de entrada para actualizar el símbolo actual
document.getElementById('search-input').addEventListener('blur', function() {
    const input = event.target.value; // Usa const o let para variables locales

});


// Carga todos los archivos CSV y actualiza la lista de instrumentos
Promise.all(symbol.map(file => loadCSV(`/ratios-argy/${file}`))) // Reemplaza con la ruta correcta
    .then(results => {
        const instrumentList = document.getElementById('instrument-list');
        
        // Limpiar la lista existente antes de cargar nuevos instrumentos
        instrumentList.innerHTML = ''; // Limpia los elementos anteriores

        results.forEach((data, index) => {
            const listItem = document.createElement('li');
            const button = document.createElement('button');
            const fileName = symbol[index].replace('.csv', ''); // Obtener el nombre del archivo sin extensión
            
            button.textContent = fileName; // Solo mostrar el nombre del archivo
            button.onclick = () => {
                selectedInstrument = symbol[index]; // Almacena el archivo seleccionado globalmente
                loadChartData(selectedInstrument); // Carga los datos del gráfico para el archivo
                fetchAndUpdateChartData(selectedInstrument); // Actualiza el gráfico inmediatamente
                
            };
            listItem.className = 'instrument-item'; // Asigna la clase para aplicar estilos
            listItem.appendChild(button);
            instrumentList.appendChild(listItem);
        });

        // Establece el primer archivo como el seleccionado por defecto, si hay alguno
        if (results.length > 0) {
            selectedInstrument = symbol[0]; // Asigna el primer archivo como seleccionado por defecto
            loadChartData(selectedInstrument); // Cargar datos del gráfico para el primer archivo
            fetchAndUpdateChartData(selectedInstrument); // Actualizar el gráfico para el primer archivo
        }

        document.getElementById('search-input').value = ''; // Limpiar el campo de búsqueda
    })
    .catch(error => console.error('Error al cargar la lista de instrumentos:', error));

// Función para parsear el CSV (puedes usarla si la necesitas más adelante)
function parseCSV(data) {
    const lines = data.split('\n');
    return lines.map(line => line.trim()).filter(line => line.length > 0); // Eliminar líneas vacías
}

function calculateBollingerBands(data, period = 20, multiplier = 2) {
    const bands = [];
    const movingAverage = [];

    for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        const prices = slice.map(d => d.cierre);
        const average = prices.reduce((sum, value) => sum + value, 0) / period;
        movingAverage.push({ time: data[i].fecha, value: average });

        const variance = prices.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        bands.push({
            time: data[i].fecha,
            upper: average + (multiplier * stdDev),
            lower: average - (multiplier * stdDev),
        });
    }

    return { bands, movingAverage };
}

// Función para calcular los ratios (cierre, apertura, alto, bajo)
function calculateRatio(data1, data2) {
    const divisionValues = {
        close: [],
        open: [],
        high: [],
        low: []
    };
    
    const datesSet = new Set(data1.map(item => item.fecha));

    data2.forEach(item => {
        if (datesSet.has(item.fecha)) {
            const data1Item = data1.find(d => d.fecha === item.fecha);
            if (data1Item) {
                // Ratios para cierre, apertura, alto, bajo
                if (data1Item.cierre && item.cierre) {
                    divisionValues.close.push({
                        time: new Date(item.fecha).getTime() / 1000, // Convertir fecha a segundos
                        value: data1Item.cierre / item.cierre,
                    });
                }
                if (data1Item.apertura && item.apertura) {
                    divisionValues.open.push({
                        time: new Date(item.fecha).getTime() / 1000,
                        value: data1Item.apertura / item.apertura,
                    });
                }
                if (data1Item.alto && item.alto) {
                    divisionValues.high.push({
                        time: new Date(item.fecha).getTime() / 1000,
                        value: data1Item.alto / item.alto,
                    });
                }
                if (data1Item.bajo && item.bajo) {
                    divisionValues.low.push({
                        time: new Date(item.fecha).getTime() / 1000,
                        value: data1Item.bajo / item.bajo,
                    });
                }
            }
        }
    });

    return divisionValues;
}

async function loadChartData(input) {
    // Limpiar los datos previos del gráfico
    lineSeries.setData([]);
    divisionSeries.setData([]);
    volumeSeries.setData([]);
    candleSeries.setData([]);
    upperBandSeries.setData([]);
    lowerBandSeries.setData([]);
    movingAverageSeries.setData([]);
    upperBandData = [];
    lowerBandData = [];
    movingAverageData = [];
    bandsVisible = false;

    // Actualizar el estado del botón de bandas de Bollinger
    document.getElementById('toggle-bands').textContent = bandsVisible ? 'Ocultar Bandas de Bollinger' : 'Mostrar Bandas de Bollinger';
    const inputUpperCase = input; // 



    // Verificar si el input es un ratio (par de símbolos separados por '/')
    if (inputUpperCase.includes('/')) {
        const [symbol1, symbol2] = inputUpperCase.split('/').map(s => s.trim()); // Extraer los símbolos

        // Llamar a la función que procesa ratios
        
        await fetchAndUpdateChartDataRatio(symbol1, symbol2);
        document.getElementById('instrument-title').textContent = `Ratio ${symbol1.replace('.csv', '')}/${symbol2.replace('.csv', '')}`;


    } else {
        // Cargar datos del símbolo individual
        await fetchAndUpdateChartData(inputUpperCase);
        //await fetchAndUpdateChartData(input);

        document.getElementById('instrument-title').textContent = `Análisis de ${inputUpperCase.replace('.csv', '')}`;

    }

    // Limpiar el campo de búsqueda
    document.getElementById('search-input').value = '';

    // Si las bandas de Bollinger están activadas, cargarlas
    if (bandsVisible) {
        const filteredResults = candleSeries.getData(); // Obtener los datos actuales del gráfico

        // Calcular las bandas de Bollinger y medias móviles
        const { bands, movingAverage } = calculateBollingerBands(filteredResults.map(result => ({
            fecha: result.time,
            cierre: result.close
        })));

        upperBandData = bands.map(b => ({ time: b.time, value: b.upper }));
        lowerBandData = bands.map(b => ({ time: b.time, value: b.lower }));
        movingAverageData = movingAverage;

        upperBandSeries.setData(upperBandData);
        lowerBandSeries.setData(lowerBandData);
        movingAverageSeries.setData(movingAverageData);
    }
}

function search() {
    const searchInput = document.getElementById('search-input').value.trim(); // Obtener el valor del campo de búsqueda

    if (!searchInput) {
        console.error("El campo de búsqueda está vacío.");
        return; // Salir si no hay valor
    }

    const processedInput = processInput(searchInput); // Procesar la entrada del usuario

    // Cargar los datos del gráfico usando la entrada procesada
    loadChartData(processedInput); 
    selectedInstrument = processedInput;

    // Limpiar el campo de búsqueda
    document.getElementById('search-input').value = '';
    
    // Ocultar las sugerencias (si es necesario)
    const suggestions = document.getElementById('suggestions');
    suggestions.style.display = 'none';
    suggestions.innerHTML = ''; // Limpiar contenido de sugerencias
}



// Manejo del evento de teclado
document.getElementById('search-input').addEventListener('keydown', function(e) {
    const suggestions = document.getElementById('suggestions');
    const suggestionDivs = suggestions.querySelectorAll('div');
    const searchInput = document.getElementById('search-input');

    // Actualizar el valor actual en cada pulsación de tecla
    if (!firstSuggestionConfirmed) {
        currentInput = searchInput.value;
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }

    // Limpiar el input en caso de retroceso o borrado
    if (['Backspace', 'Delete'].includes(e.key)) {
        highlightedIndex = -1; // Reiniciar la selección de sugerencias
        firstSuggestionConfirmed = false; // Reiniciar la confirmación
        currentInput = searchInput.value;
    }

    // Navegar hacia abajo o hacia arriba en las sugerencias
    if (e.key === 'ArrowDown') {
        if (highlightedIndex < suggestionDivs.length - 1) {
            highlightedIndex++;
            highlightSuggestion(suggestions, highlightedIndex);
            const selectedText = suggestionDivs[highlightedIndex].innerText;
            updateSearchInput(`${selectedText}`, searchInput);
        }
    } else if (e.key === 'ArrowUp') {
        if (highlightedIndex > 0) {
            highlightedIndex--;
            highlightSuggestion(suggestions, highlightedIndex);
            const selectedText = suggestionDivs[highlightedIndex].innerText;
            updateSearchInput(`${selectedText}`, searchInput);
        }
    } else if (e.key === 'Enter') {
        // Prevenir el envío del formulario
        e.preventDefault();
        highlightedIndex = -1;

        // Llamar a la función search para procesar el input
        search();
    } else if (e.key === 'Escape') {
        // Cerrar las sugerencias
        suggestions.style.display = 'none';
        suggestions.innerHTML = ''; // Limpiar contenido de sugerencias
        highlightedIndex = -1;
    }
});


function filterInstruments() {
    const input = document.getElementById('search-input').value.toUpperCase();
    const suggestions = document.getElementById('suggestions');
    suggestions.innerHTML = ''; // Limpiar las sugerencias
    let highlightedIndex = -1; // Reiniciar el índice destacado

    // Dividir el input si contiene un "/"
    const inputs = input.includes('/') ? input.split('/').map(s => s.trim()) : [input];

    // Si hay una barra '/', filtra el primer símbolo y muestra todos los demás
    if (inputs.length > 1) {
        const firstSymbol = inputs[0];
        const secondSymbol = inputs[1];

        // Filtrar los símbolos que coincidan con cualquiera de los dos
        const filteredSymbols = symbol.filter(symb =>
            symb.toUpperCase().includes(firstSymbol) || 
            symb.toUpperCase().includes(secondSymbol)
        );

        if (filteredSymbols.length > 0) {
            suggestions.style.display = 'block';
            filteredSymbols.forEach((symb, index) => {
                const suggestionDiv = document.createElement('div');
                // Eliminar la extensión .csv de la visualización
                suggestionDiv.textContent = symb.replace('.csv', '');
                suggestionDiv.tabIndex = 0;
                suggestionDiv.onclick = () => {
                    const cleanedSymbol = symb.replace('.csv', '');

                    // Si ya hay un primer símbolo cargado y se presiona la sugerencia, se mantiene el primer símbolo.
                    if (inputs.length > 1) {
                        document.getElementById('search-input').value = `${firstSymbol}/${cleanedSymbol}`; 
                    } else {
                        document.getElementById('search-input').value = cleanedSymbol;
                    }
                    
                    // Actualizar la variable global selectedInstrument
                    selectedInstrument = document.getElementById('search-input').value; 
                    suggestions.style.display = 'none'; // Ocultar las sugerencias
                    document.getElementById('instrument-title').textContent = `Análisis de ${selectedInstrument.replace('.csv', '')}`;
                    search();

                };
                suggestionDiv.onmouseover = () => {
                    highlightedIndex = index;
                    highlightSuggestion(suggestions, highlightedIndex);
                };
                suggestions.appendChild(suggestionDiv);
            });
        } else {
            suggestions.style.display = 'block';
            const noSuggestionsDiv = document.createElement('div');
            noSuggestionsDiv.textContent = 'No hay sugerencias';
            suggestions.appendChild(noSuggestionsDiv);
        }
    } else {
        // Filtrar los símbolos que coincidan con el input
        const filteredSymbols = symbol.filter(symb => 
            symb.toUpperCase().includes(input)
        );

        if (filteredSymbols.length > 0) {
            suggestions.style.display = 'block';
            filteredSymbols.forEach((symb, index) => {
                const suggestionDiv = document.createElement('div');
                // Eliminar la extensión .csv de la visualización
                suggestionDiv.textContent = symb.replace('.csv', '');
                suggestionDiv.tabIndex = 0;
                suggestionDiv.onclick = () => {
                    // Aquí también actualizamos el selectedInstrument correctamente
                    document.getElementById('search-input').value = symb;
                    selectedInstrument = symb; // Actualizar la variable global
                    suggestions.style.display = 'none'; // Ocultar las sugerencias
                    document.getElementById('search-input').value = ''; // Limpiar el campo de búsqueda
                    document.getElementById('instrument-title').textContent = `Análisis de ${selectedInstrument.replace('.csv', '')}`;
                  
                    
                };

                suggestionDiv.onmouseover = () => {
                    highlightedIndex = index;
                    highlightSuggestion(suggestions, highlightedIndex);
                };
                suggestions.appendChild(suggestionDiv);

            });
        } else {
            suggestions.style.display = 'block';
            const noSuggestionsDiv = document.createElement('div');
            noSuggestionsDiv.textContent = 'No hay sugerencias';
            suggestions.appendChild(noSuggestionsDiv);
        }
    }
}

function highlightSuggestion(suggestions, index) {
    const suggestionDivs = suggestions.querySelectorAll('div');
    suggestionDivs.forEach((div, idx) => {
        div.classList.remove('highlight');
        if (idx === index) {
            div.classList.add('highlight'); // Resaltar sugerencia seleccionada
        }
    });
}
// Función para ocultar las sugerencias
function hideSuggestions() {
    const suggestionContainer = document.getElementById('suggestions'); // Cambia esto por el ID correcto de tu contenedor
    suggestionContainer.style.display = 'none'; // Oculta el contenedor de sugerencias
}
// Función para actualizar la visibilidad de las bandas de Bollinger
function updateBollingerBandsVisibility() {
    if (bandsVisible) {
        document.getElementById('toggle-bands').textContent = 'Ocultar Bandas de Bollinger';
        // Mostrar las bandas si está activado
        upperBandSeries.setData(upperBandData);
        lowerBandSeries.setData(lowerBandData);
        movingAverageSeries.setData(movingAverageData);
    } else {
        document.getElementById('toggle-bands').textContent = 'Mostrar Bandas de Bollinger';
        // Ocultar las bandas si está desactivado
        upperBandSeries.setData([]);
        lowerBandSeries.setData([]);
        movingAverageSeries.setData([]);
    }
}

// Botón para alternar la visibilidad de las bandas de Bollinger
document.getElementById('toggle-bands').addEventListener('click', function () {
    bandsVisible = !bandsVisible; // Cambiar el estado de las bandas de Bollinger
    updateBollingerBandsVisibility(); // Actualizar la visibilidad según el estado

});


function convertCandleToLineSeries(candleData) {
    return candleData.map(item => ({
        time: item.time,
        value: item.close // Usamos el cierre como valor de la línea
    }));
}
function toggleChartType(isRatio = false) {
    let dataToUse = isRatio ? ratioData : formattedData; // Usar ratioData o formattedData según corresponda
    const chartTypeText = isLineChart ? "Mostrar Gráfico de Línea" : "Mostrar Gráfico de Velas";


    if (isLineChart) {
        // Cambiar a gráfico de velas
        candleSeries.setData(dataToUse); // Establecer datos para el gráfico de velas
        lineSeries.setData([]); // Limpiar datos de línea


    } else {
        // Cambiar a gráfico de línea
        const lineData = convertCandleToLineSeries(dataToUse); // Convertir datos a serie de línea
        lineSeries.setData(lineData); // Establecer datos de línea
        candleSeries.setData([]); // Limpiar datos de velas


    }

    document.getElementById('toggle-chart').innerText = chartTypeText; // Actualizar el texto del botón
    isLineChart = !isLineChart; // Alternar el estado del gráfico
    updateChart();
    
}



function updateChart() {

    console.log("El cierre del penúltimo día es:", valorCierre);

    if (selectedInstrument) {
        if (!selectedInstrument.includes('/')) { // Comprueba que hay un solo símbolo
            fetchAndUpdateChartData(selectedInstrument); // Llama a la función con el símbolo seleccionado

            
        } else {
            const [symbol1, symbol2] = selectedInstrument.split('/').map(s => s.trim());

            // Verificar si ambos símbolos existen en la lista de instrumentos
            if (symbol.includes(symbol1) && symbol.includes(symbol2)) {
                if (!symbol1 || !symbol2) {
                    console.error('Ambos símbolos deben estar definidos antes de hacer la solicitud.');
                    return; // Detener ejecución si hay un símbolo indefinido
                }
                
                fetchAndUpdateChartDataRatio(symbol1, symbol2);
                
            } else {
                console.error(`${symbol1}/${symbol2} no existe en la lista de instrumentos.`);
            }
        }
    }
}

// Llamar a updateChart cada segundo
//setInterval(updateChart, 1000);


