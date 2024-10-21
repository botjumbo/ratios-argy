const symbols = ['AL30', 'AL30D','GD30', 'GD30D','AE38', 'AE38D','AL30C', 'AL35','AL35D', 'GD30C','GD35', 'GD35D','MERVAL', 'TX26','TX28','S11N4','S2N4D','S2O4D','S31O4','AL30C1m'];
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
    priceFormat: {
        type: 'price',   // Tipo de formato (para el precio)
        precision: 3,    // 3 decimales
        minMove: 0.001,  // Movimiento mínimo de 0.001 para reflejar los 3 decimales
    }
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
const dailyClosePrices = {}; // Objeto para almacenar cierres diarios
const dailyRatioClosePrices = {}; // Asegúrate de inicializar este objeto
let divisionValues = { // Declarar como variable global
    open: [],
    high: [],
    low: [],
    close: [],
    time: []
};



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
        console.log("formattedData:", formattedData);

        // Almacena el cierre diario
        rows.forEach(item => {
            const date = item.fecha; // Obtener la fecha
            const closePrice = item.cierre; // Obtener el cierre
    
            // Almacena el precio de cierre en el objeto, usando la fecha como clave
            dailyClosePrices[date] = closePrice;

        });
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
                    const ratioClose = item1.close / item2.close;
                    dailyRatioClosePrices[item2.time] = ratioClose;
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
            console.log("Ratiodata:", ratioData);

        
        
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

let lastValidData = ""; // Asegúrate de que sea una variable `let`
let previousClosePriceRatio = null; // Variable global
let previousClosePrice = null; // Variable global


chart.subscribeCrosshairMove(function(param) {
    // Comprobar si hay datos válidos
    if (!param || !param.seriesData || param.seriesData.size === 0) {
        // Mantener el último dato mostrado si no hay interacción
        legendElement.innerHTML = lastValidData;
        return;
    }

    const currentPrice = candleSeries.coordinateToPrice(param.point.y); // Precio actual basado en el cursor
    const currentDate = formatDate(param.time); // Formatear la fecha actual
    const previousClosePrice = getPreviousClosePrice(currentDate);
    const previousClosePriceRatio = getPreviousRatioClosePrice(currentDate);
    console.log("El dato previo de precio es:", previousClosePrice);

    // Obtener los datos de las series
    const price = isLineChart ? param.seriesData.get(lineSeries) : param.seriesData.get(candleSeries);
    console.log("El precio es:", price);
    
    // Validación de price
    if (!price) {
        console.warn("No hay datos para el precio en la serie seleccionada");
        return; // Salir si price es undefined
    }

    const volumeData = param.seriesData.get(volumeSeries);
    let totalVolume = volumeData ? volumeData.value : 0; // Almacenar volumen total

    if (isLineChart) {
        let PercentageDifference = null;
        let lineLegendContent = `
            <strong>Fecha:</strong> ${formatDate(param.time)} <br>
            <strong>Cierre:</strong> ${price.value ? price.value.toFixed(2) : 'N/A'} <br>
            <strong>Volumen:</strong> ${(totalVolume / 1000000).toFixed(2)}M <br>
        `;

        if (previousClosePrice !== null && price.value) {
            const currentRatio = price.value;
            console.log(currentRatio);
            console.log(previousClosePrice);
            ratioPercentageDifference = ((currentRatio / previousClosePrice) - 1) * 100;
        }

        if (ratioPercentageDifference !== null) {
            lineLegendContent += `
                <strong>Diferencia:</strong> ${ratioPercentageDifference.toFixed(2)} % <br>
            `;
        }
        legendElement.innerHTML = lineLegendContent;
        lastValidData = lineLegendContent;

    } else {
        // Si no es un gráfico de línea , mostrar datos del precio para gráfico de velas
        let ligthLegendContent = `
            <strong>Fecha:</strong> ${formatDate(param.time)} <br>
            <strong>Apertura:</strong> ${price.open ? price.open.toFixed(2) : 'N/A'} <br>
            <strong>Máximo:</strong> ${price.high ? price.high.toFixed(2) : 'N/A'} <br>
            <strong>Mínimo:</strong> ${price.low ? price.low.toFixed(2) : 'N/A'} <br>
            <strong>Cierre:</strong> ${price.close ? price.close.toFixed(2) : 'N/A'} <br>
            <strong>Volumen:</strong> ${volumeData ? formatVolume(volumeData.value) : 'N/A'} <br>
        `;

        const currentPriceLigth = price.close; // Cambiado de price.value a price.close

        // Calcular la diferencia porcentual si el cierre del día anterior es válido
        let PercentageDifference = null;
        if (previousClosePrice !== null && price.close) {
            PercentageDifference = ((currentPriceLigth / previousClosePrice) - 1) * 100;
        }

        console.log("La diferencia porcentual vs el día anterior es:", PercentageDifference);
        // Agregar la diferencia porcentual a la leyenda del gráfico de velas
        if (PercentageDifference !== null) {
            ligthLegendContent += `
                <strong>Diferencia:</strong> ${PercentageDifference.toFixed(2)} % <br>
            `;
        }

        // Actualizar la leyenda y el último dato válido
        legendElement.innerHTML = ligthLegendContent;
        lastValidData = ligthLegendContent;
    }
});
// Función para obtener el cierre del día anterior
function getPreviousClosePrice(currentDate) {
    // Obtener las fechas de las claves del objeto y convertirlas a un array
    const dates = Object.keys(dailyClosePrices);
    // Ordenar las fechas para buscar la anterior
    const sortedDates = dates.sort((a, b) => new Date(a) - new Date(b));

    // Buscar el índice de la fecha actual
    const currentIndex = sortedDates.indexOf(currentDate);
    // Si la fecha actual es la primera, no hay cierre anterior
    if (currentIndex <= 0) return null;

    // Obtener el cierre anterior usando el índice
    const previousDate = sortedDates[currentIndex - 1]; // La fecha anterior
    return dailyClosePrices[previousDate]; // Retornar el precio de cierre del día anterior
}
function getPreviousRatioClosePrice(currentDate) {
    // Convertir la fecha actual a un objeto Date
    const currentDateObj = new Date(currentDate);

    // Ordenar los datos por fecha (en caso de que no estén ordenados)
    const sortedRatioData = [...ratioData].sort((a, b) => new Date(a.time) - new Date(b.time));

    // Encontrar el índice del elemento con la fecha actual
    const currentIndex = sortedRatioData.findIndex(item => {
        const itemDate = new Date(item.time);
        return itemDate.getTime() === currentDateObj.getTime();
    });

    // Si encontramos el índice y no es el primer día, devolvemos el precio de cierre del día anterior
    if (currentIndex > 0) {
        const previousDay = sortedRatioData[currentIndex - 1]; // El día anterior
        return previousDay.close; // Retornamos el precio de cierre
    }

    // Si no hay día anterior o no se encuentra el actual, devolver null
    return null;
}
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
Promise.all(symbol.map(file => loadCSV(`/ratios-argy/${file}`))) // Asegúrate de que esta ruta es correcta
    .then(results => {
        const instrumentList = document.getElementById('instrument-list');
        
        // Limpiar la lista existente antes de cargar nuevos instrumentos
        instrumentList.innerHTML = ''; // Limpia los elementos anteriores

        results.forEach((data, index) => {
            // Si el archivo no se cargó correctamente, puedes ignorarlo
            if (!data) {
                console.warn(`El archivo ${symbol[index]} no se pudo cargar.`);
                return;
            }

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


// Procesa el archivo CSV y maneja celdas vacías
function parseCSV(data) {
    const rows = data.split('\n'); // Divide las filas del CSV
    const result = [];

    rows.forEach((row) => {
        const columns = row.split(','); // Divide las columnas
        const cleanedColumns = columns.map((cell) => {
            const trimmedCell = cell.trim(); // Elimina espacios en blanco

            // Si la celda está vacía, retorna 'Valor inválido', pero acepta 0.0 como válido
            if (trimmedCell === '') {
                return '0.0'; // O el valor que desees para celdas vacías
            }
            
            return trimmedCell; // Retorna la celda tal cual si tiene contenido
        });
        result.push(cleanedColumns);
    });

    return result;
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

function toggleChartType() {
    // Reiniciar variables relevantes al cambiar el tipo de gráfico

    const chartTypeText = isLineChart ? "Mostrar Gráfico de Línea" : "Mostrar Gráfico de Velas";

    // Obtener el valor del input de búsqueda
    const searchInputValue = document.getElementById('search-input').value;
    const isRatio = searchInputValue.includes('/') && searchInputValue.split('/').length === 2;

    if (isLineChart) {
        // Cambiar a gráfico de velas
        if (isRatio) {
            candleSeries.setData(ratioData);
            lineSeries.setData([]);
            const [symbol1, symbol2] = searchInputValue.split('/').map(symbol => symbol.trim());
            fetchAndUpdateChartDataRatio(symbol1, symbol2);
        } else {
            candleSeries.setData(formattedData);
            lineSeries.setData([]);
            loadChartData(selectedInstrument);
        }
    } else {
        // Cambiar a gráfico de línea
        if (isRatio) {
            const lineData = convertCandleToLineSeries(ratioData);
            lineSeries.setData(lineData);
            candleSeries.setData([]);
        } else {
            const lineData = convertCandleToLineSeries(formattedData);
            lineSeries.setData(lineData);
            candleSeries.setData([]);
        }
        loadChartData(selectedInstrument);
    }
    // Alternar el estado del gráfico
    isLineChart = !isLineChart;
    // Actualizar el texto del botón

    document.getElementById('toggle-chart').innerText = chartTypeText;


}

// Función para agregar datos en diferentes intervalos de tiempo
function agregarIntervalo(data, interval) {
    let resultado = [];
    let temp = [];

    data.forEach((candle, index) => {
        temp.push(candle);

        if ((index + 1) % interval === 0) {
            let open = temp[0].apertura;
            let close = temp[temp.length - 1].cierre;
            let high = Math.max(...temp.map(t => t.maximo));
            let low = Math.min(...temp.map(t => t.minimo));
            let volume = temp.reduce((acc, t) => acc + t.volumen, 0);
            let fecha = temp[temp.length - 1].fecha;

            resultado.push({
                fecha: fecha,
                apertura: open,
                maximo: high,
                minimo: low,
                cierre: close,
                volumen: volume
            });

            temp = [];
        }
    });

    return resultado;
}

// Función para cargar datos y agrupar en intervalos deseados
function cargarDatos(intervalo) {
    let dataDiaria = []; 
    let dataMinuto = [];
    
    // Lógica para cargar los datos según el intervalo
    switch(intervalo) {
        case 'diaria':
            console.log("Datos diarios:", dataDiaria);
            return dataDiaria;  // Asegúrate de que haya datos aquí
        case 'semanal':
            const semanal = agregarIntervalo(dataDiaria, 5); 
            console.log("Datos semanales:", semanal);
            return semanal;  
        case '4horas':
            const cuatroHoras = agregarIntervalo(dataMinuto, 240);
            console.log("Datos de 4 horas:", cuatroHoras);
            return cuatroHoras; 
        case '1hora':
            const unaHora = agregarIntervalo(dataMinuto, 60);  
            console.log("Datos de 1 hora:", unaHora);
            return unaHora;  
        case '30min':
            const treintaMin = agregarIntervalo(dataMinuto, 30);  
            console.log("Datos de 30 minutos:", treintaMin);
            return treintaMin;  
        case '15min':
            const quinceMin = agregarIntervalo(dataMinuto, 15);  
            console.log("Datos de 15 minutos:", quinceMin);
            return quinceMin;  
        default:
            console.log("Datos diarios (por defecto):", dataDiaria);
            return dataDiaria;
    }
}
function renderizarGrafico(intervalo) {

    let data = cargarDatos(intervalo);
    console.log("Datos a renderizar:", data); // Para verificar los datos que se van a renderizar

    if (data.length > 0) {
        candleSeries.setData(data.map(candle => ({
            time: new Date(candle.fecha).getTime() / 1000, // Convertir la fecha a formato UNIX
            open: candle.apertura,
            high: candle.maximo,
            low: candle.minimo,
            close: candle.cierre
        })));
    } else {
        console.warn("No hay datos para renderizar el gráfico en el intervalo seleccionado.");
    }

    chart.timeScale().fitContent();
}

// Manejar el cambio de intervalo de tiempo
document.getElementById('interval-selector').addEventListener('change', function(event) {
    let selectedInterval = event.target.value;
    renderizarGrafico(selectedInterval);
});

// Inicializar con intervalo diario por defecto
renderizarGrafico('diaria');
function updateChart() {
    // Reiniciar datos previos al actualizar el gráfico

    // Si hay un símbolo seleccionado
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
                //fetchAndUpdateChartData(divisionValues); // Llama a la función con el símbolo seleccionado

                fetchAndUpdateChartDataRatio(symbol1, symbol2);
                console.log(`${symbol1}/${symbol2} instrumentos seleccionados.`);
                
            } else {
                console.error(`${symbol1}/${symbol2} no existe en la lista de instrumentos.`);
            }
        }
    }
}

// Llamar a updateChart cada segundo
//setInterval(updateChart, 1000);

