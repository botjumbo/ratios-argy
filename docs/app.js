const symbols = ['AL30', 'AL30D','GD30', 'GD30D','AE38', 'AE38D','AL30C', 'AL35','AL35D', 'GD30C','GD35', 'GD35D','MERVAL', 'TX26','TX28','S11N4','S2N4D','DOLARCCL','DOLARMEP','CER','GD46','GD46D','DICP','CUAP','DOLARBLUE','DOLAROFICIAL','S13D4','S2D4D','DOLARCRIPTO'];
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
    upColor: '#1e8c6e',
    downColor: '#d65a5a',
    borderVisible: false,
    wickUpColor: '#1e8c6e',
    wickDownColor: '#d65a5a',
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

    
}async function fetchAndUpdateChartData(symbol) {
    try {
        const response = await fetch(`/ratios-argy/${symbol}`);
        if (!response.ok) {
            throw new Error(`Error al cargar los datos del símbolo: ${symbol}. Respuesta del servidor: ${response.statusText}`);
        }

        const data = await response.text();
        const rows = data.split('\n').slice(1).map(row => {
            const items = row.split(',').map(item => item.trim());
            if (items.length < 7) return null;  // Ignora solo si no tiene suficientes columnas

            const [especie, fecha, apertura, maximo, minimo, cierre, volumen] = items;

            // Convertir a número y asignar valor predeterminado si es nulo o cero
            const parsedApertura = parseFloat(apertura) || 0.01; // Valor predeterminado
            const parsedMaximo = parseFloat(maximo) || parsedApertura; // Asume apertura si max es 0
            const parsedMinimo = parseFloat(minimo) || parsedApertura; // Asume apertura si min es 0
            const parsedCierre = parseFloat(cierre) || parsedApertura; // Asume apertura si cierre es 0
            const parsedVolumen = parseInt(volumen) || 1; // Valor predeterminado para volumen

            return { 
                especie, 
                fecha, 
                apertura: parseFloat(parsedApertura.toFixed(3)), 
                maximo: parseFloat(parsedMaximo.toFixed(3)), 
                minimo: parseFloat(parsedMinimo.toFixed(3)), 
                cierre: parseFloat(parsedCierre.toFixed(3)), 
                volumen: parsedVolumen,
            };
        }).filter(item => item !== null);

        if (rows.length === 0) {
            console.warn("No se encontraron datos válidos.");
            return;
        }

        // Formatear los datos para el gráfico
        formattedData = rows.map(item => ({
            time: formatDate(item.fecha),
            open: item.apertura,
            high: item.maximo,
            low: item.minimo,
            close: item.cierre,
            volume: item.volumen,
        }));
     
        formattedData.forEach(item => {
            if (!item.time || !item.open || !item.close || isNaN(item.open) || isNaN(item.close)) {
                console.warn(`Datos inválidos para la fecha: ${item.time}`);
            }
        });
        // Almacenar cierre diario
        rows.forEach(item => {
            const date = item.fecha;
            const closePrice = item.cierre;
            dailyClosePrices[date] = closePrice;
        
        });
        console.log(formattedData);
        // Actualizar gráficos
        if (!isLineChart) {
            candleSeries.setData(formattedData);
        } else {
            const lineData = convertCandleToLineSeries(formattedData);
            lineSeries.setData(lineData);
        }

        // Configurar datos de volumen con color según variación
        const volumeData = rows.map(item => ({
            time: item.fecha,
            value: item.volumen,
            color: item.cierre >= item.apertura ? '#1e8c6e' : '#d65a5a',
        }));
        volumeSeries.setData(volumeData);
        // Verificar datos antes de calcular las bandas de Bollinger
        if (formattedData.length === 0) {
            console.warn("No hay datos disponibles para calcular las bandas de Bollinger.");
            return;
        }
        
        const validData = formattedData.filter(item => item.close > 0);
        if (validData.length < 20) {  // Reemplaza 20 con el período que necesites
            console.warn("No hay suficientes datos válidos (se requiere un mínimo de 20 puntos) para calcular las bandas de Bollinger.");
            return;
        }
        
        validData.forEach(item => {
            if (typeof item.close !== 'number' || isNaN(item.close)) {
                console.warn(`El valor de cierre no es válido para la fecha ${item.time}: ${item.close}`);
            }
        });
        
        console.log("Datos para el cálculo de bandas de Bollinger:", validData.map(item => ({ fecha: item.time, cierre: item.close })));
        
        // Calcular las bandas de Bollinger y la media móvil
        const { bands, movingAverage } = calculateBollingerBands(
            validData.map(result => ({
                fecha: result.time,
                cierre: result.close
            }))
        );
        
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

            ratioData = formattedData1.map(item1 => {
                const item2 = formattedData2.find(item2 => item2.time === item1.time); // Buscar la fecha coincidente en AL30D
                if (item2) {
                    const ratioOpen = item1.open / item2.open;
                    const ratioHigh = item1.high / item2.high;
                    let ratioLow = item1.low / item2.low;
                    const ratioClose = item1.close / item2.close;
                    // Condición adicional: si el ratioClose es menor que ratioLow, asignar ratioLow a ratioClose
                    if (ratioClose < ratioLow) {
                        ratioLow = ratioClose;
                    }
                    

                    dailyRatioClosePrices[item2.time] = ratioClose;
                    // Condición adicional: si el ratioClose es menor que ratioLow, asignar ratioLow a ratioClose
                 

                    return {
                        time: item1.time,
                        open: ratioOpen,    // Calcular el ratio del open
                        high: ratioHigh,    // Calcular el ratio del high
                        low: ratioLow,      // Calcular el ratio del low
                        close: ratioClose   // Calcular el ratio del close (modificado si es menor que ratioLow)
                    };
                }
                
                return null; // Si no hay coincidencia, devolver null
            }).filter(Boolean); // Filtrar los valores nulos para mantener solo los datos válidos
            console.log("Ratio data es: " ,ratioData);
        
        
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

                    const openRatio = item1.open / item2.open;
                    const closeRatio = item1.close / item2.close;

                    
                    const color = closeRatio >= openRatio ? '#1e8c6e' : '#d65a5a'; // Verde si el ratio es alcista, rojo si es bajista

                    return {
                        time: item1.time,
                        value: combinedVolume,
                        color: color
                    };
                }
                return null; // Si no hay coincidencia en las fechas, ignoramos el dato
            }).filter(Boolean);
            console.log("Volumen es: " ,combinedVolumeData);

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

    const currentDate = formatDate(param.time); // Formatear la fecha actual
    // Obtener el precio de cierre del día anterior
    const previousClosePrice = getPreviousClosePrice(currentDate);
    const previousClosePriceRatio = getPreviousRatioClosePrice(currentDate);

    // Obtener los datos de las series
    const price = isLineChart ? param.seriesData.get(lineSeries) : param.seriesData.get(candleSeries);
    const volumeData = param.seriesData.get(volumeSeries);
    let totalVolume = volumeData ? volumeData.value : 0; // Almacenar volumen total
    if (selectedInstrument.includes('/')) {

        if (isLineChart) {
            let ratioPercentageDifference = null;
            let LegendContent = `
            <strong>Fecha:</strong> ${formatDate(param.time)} <br>
            <strong>Cierre:</strong> ${price ? price.value.toFixed(3) : 'N/A'} <br>  <!-- Aquí accedes a price.close -->
            <strong>Volumen:</strong> ${(totalVolume / 1000000).toFixed(2)}M <br>
            `;
    
    
            if (previousClosePriceRatio !== null && price && price.value) {
                const currentPriceRatio = price.value; // Cambiado de price.value a price.close
                ratioPercentageDifference = ((currentPriceRatio / previousClosePriceRatio) - 1) * 100;
            }
            
            if (ratioPercentageDifference !== null) {
                LegendContent += `
                    <strong>Diferencia:</strong> ${ratioPercentageDifference.toFixed(2)} % <br>
                `;
            }
            legendElement.innerHTML = LegendContent;
            lastValidData = LegendContent;
    
        } else {

            // Si no es un gráfico de línea del ratio, mostrar datos del precio del ratio(gráfico de velas)
            LegendContent = `
                <strong>Fecha:</strong> ${formatDate(param.time)} <br>
                <strong>Apertura:</strong> ${price ? price.open.toFixed(3) : 'N/A'} <br>
                <strong>Máximo:</strong> ${price ? price.high.toFixed(3) : 'N/A'} <br>
                <strong>Mínimo:</strong> ${price ? price.low.toFixed(3) : 'N/A'} <br>
                <strong>Cierre:</strong> ${price ? price.close.toFixed(3) : 'N/A'} <br>
                <strong>Volumen:</strong> ${volumeData ? formatVolume(volumeData.value) : 'N/A'} <br>
            `;
            const currentPriceRatio = price.close; // Cambiado de price.value a price.close
    
            // Calcular la diferencia porcentual si el cierre del día anterior es válido
            ratioPercentageDifference = null;
            if (previousClosePriceRatio !== null && price && price.close) {
                ratioPercentageDifference = ((currentPriceRatio / previousClosePriceRatio) - 1) * 100;
            }
            
            // Agregar la diferencia porcentual a la leyenda del gráfico de velas
            if (ratioPercentageDifference !== null) {
                LegendContent += `
                    <strong>Diferencia:</strong> ${ratioPercentageDifference.toFixed(2)} % <br>
                `;
            }
    
            // Actualizar la leyenda y el último dato válido
            legendElement.innerHTML = LegendContent;
            lastValidData = LegendContent;
        }
         
    }
    if (!selectedInstrument.includes('/')) {
    
        if (isLineChart) {
            let PercentageDifference = null;
            let LegendContent = `
            <strong>Fecha:</strong> ${formatDate(param.time)} <br>
            <strong>Cierre:</strong> ${price ? price.value.toFixed(3) : 'N/A'} <br>  <!-- Aquí accedes a price.close -->
            <strong>Volumen:</strong> ${(totalVolume / 1000000).toFixed(2)}M <br>
            `;
    
    
            if (previousClosePrice !== null && price && price.value) {
                const currentPrice = price.value; // Cambiado de price.value a price.close
                PercentageDifference = ((currentPrice / previousClosePrice) - 1) * 100;
            }
            
            if (PercentageDifference !== null) {
                LegendContent += `
                    <strong>Diferencia:</strong> ${PercentageDifference.toFixed(2)} % <br>
                `;
            }
            legendElement.innerHTML = LegendContent;
            lastValidData = LegendContent;
    
        } else {
    
            // Si no es un gráfico de línea del ratio, mostrar datos del precio del ratio(gráfico de velas)
            LegendContent = `
                <strong>Fecha:</strong> ${formatDate(param.time)} <br>
                <strong>Apertura:</strong> ${price ? price.open.toFixed(3) : 'N/A'} <br>
                <strong>Máximo:</strong> ${price ? price.high.toFixed(3) : 'N/A'} <br>
                <strong>Mínimo:</strong> ${price ? price.low.toFixed(3) : 'N/A'} <br>
                <strong>Cierre:</strong> ${price ? price.close.toFixed(3) : 'N/A'} <br>
                <strong>Volumen:</strong> ${volumeData ? formatVolume(volumeData.value) : 'N/A'} <br>
            `;
            const currentPrice = price.close; // Cambiado de price.value a price.close
    
            // Calcular la diferencia porcentual si el cierre del día anterior es válido
            PercentageDifference = null;
            if (previousClosePrice !== null && price && price.close) {
                PercentageDifference = ((currentPrice / previousClosePrice) - 1) * 100;
            }
            
            // Agregar la diferencia porcentual a la leyenda del gráfico de velas
            if (PercentageDifference !== null) {
                LegendContent += `
                    <strong>Diferencia:</strong> ${PercentageDifference.toFixed(2)} % <br>
                `;
            }
    
            // Actualizar la leyenda y el último dato válido
            legendElement.innerHTML = LegendContent;
            lastValidData = LegendContent;
        }
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
        tooltip.style.display = 'block'; // Mostrar el tooltip
    } else if (isMeasuring) {
        // Si ya estamos midiendo y se hace clic, ocultar el tooltip y detener la medición
        isMeasuring = false;
        initialPrice = null; // Reiniciar el precio inicial
        tooltip.style.display = 'none'; // Ocultar el tooltip
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

    const chartTypeText = isLineChart ? "Línea" : "Velas";

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
