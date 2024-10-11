
        

//--------------------------------------------------------------------------------------------------------//
const legendElement = document.getElementById('legend');

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



let instruments = [];
let bandsVisible = false;
let upperBandData = [];
let lowerBandData = [];
let movingAverageData = [];
let selectedInstrument = instruments.length > 0 ? instruments[0] : null;
let initialPrice = null;
let isMeasuring = false; // Para saber si estamos midiendo el cambio porcentual
let isShiftPressed = false;
let highlightedIndex = -1; // Índice de la sugerencia resaltada
let currentInput = ''; // Variable para guardar el valor actual
let firstSuggestionConfirmed = false;
//let cursorPosition = searchInput.value.length;


// Función para obtener nuevos datos y actualizar el gráfico


function fetchAndUpdateChartData(symbol) {

    fetch(`/data?symbol=${symbol}`)
        .then(response => response.json())
        .then(data => {

            // Actualizamos la serie de velas
            const formattedData = data.map(item => ({
                time: item.fecha,
                open: item.apertura,
                high: item.maximo,
                low: item.minimo,
                close: item.cierre,
                volume: item.volumen,
            }));


            candleSeries.setData(formattedData);

            volumeSeries.setData(data.map(item => ({
                time: item.fecha,
                value: item.volumen,
                color: item.cierre >= item.apertura ? '#4fff00' : '#ff4976',
            })));
          
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
        })
        .catch(error => console.error('Error al cargar los datos del símbolo:', error));

}

function fetchAndUpdateChartDataRatio(symbol1, symbol2) {

    Promise.all([
        fetch(`/data?symbol=${symbol1}`).then(response => response.json()),
        fetch(`/data?symbol=${symbol2}`).then(response => response.json())
    ]).then(([data1, data2]) => {

        if (Array.isArray(data1) && Array.isArray(data2)) {

            // Formatear los datos de data1 (ej. AL30)
            const formattedData1 = data1.map(item => ({
                time: item.fecha,  // Convertir la fecha a formato de segundos
                open: item.apertura, // Para determinar el color del volumen
                high : item.minimo,
                low : item.maximo,
                close: item.cierre,
                volume: item.volumen
            }));

            // Formatear los datos de data2 (ej. AL30D)
            const formattedData2 = data2.map(item => ({
                time: item.fecha,  // Convertir la fecha a formato de segundos
                open: item.apertura, // Para determinar el color del volumen
                high : item.minimo,
                low : item.maximo,
                close: item.cierre,
                volume: item.volumen
            }));

            // Crear la serie de datos para el ratio (cierre,alto,bajo,open de AL30 dividido entre cierre,alto,bajo,open de AL30D)
            const ratioData = formattedData1.map(item1 => {
                const item2 = formattedData2.find(item2 => item2.time === item1.time); // Buscar la fecha coincidente en AL30D
                if (item2) {
                    return {
                        time: item1.time,
                        open: item1.open / item2.open,   // Calcular el ratio del open
                        high: item1.high / item2.high,   // Calcular el ratio del high
                        low: item1.low / item2.low,      // Calcular el ratio del low
                        close: item1.close / item2.close // Calcular el ratio del close
                    };
                }
                return null; // Si no hay coincidencia, devolver null
            }).filter(Boolean); // Filtrar los valores nulos para mantener solo los datos válidos

            candleSeries.setData(ratioData);

            // Crear una nueva serie para los volúmenes sumados
            const combinedVolumeData = formattedData1.map(item1 => {
                const item2 = formattedData2.find(item2 => item2.time === item1.time); // Buscar la fecha coincidente en AL30D

                if (item2) {
                    // Sumar los volúmenes de ambos símbolos
                    const combinedVolume = item1.volume + item2.volume;

                    // Determinar el color en función del símbolo con mayor volumen
                    const useItem1Color = item1.volume >= item2.volume;
                    const color = useItem1Color
                        ? (item1.close >= item1.open ? '#4fff00' : '#ff4976') // Basado en AL30
                        : (item2.close >= item2.open ? '#4fff00' : '#ff4976'); // Basado en AL30D

                    return {
                        time: item1.time,
                        value: combinedVolume,
                        color: color // Usar el color correspondiente al mayor volumen
                    };
                }

                return null; // Si no hay coincidencia en las fechas, ignoramos el dato
            }).filter(Boolean); // Filtrar los valores nulos

            // Actualizar la serie de volumen sumado
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

        } else if (!Array.isArray(data.data1) || !Array.isArray(data.data2)) {
            console.error('data1 o data2 no son arreglos', { data1, data2 });
            return []; // Retorna un arreglo vacío o maneja el error de otra manera
        }
    })
    .catch(error => console.error('Error al cargar los datos del símbolo:', error));
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
    // Usar solo la fecha en formato "YYYY-MM-DD"
    return new Date(date).toISOString().split('T')[0];
}


// Suscribirse al movimiento del cursor
chart.subscribeCrosshairMove(function(param) {
    if (!param || !param.seriesData || param.seriesData.size === 0) {
        // Mantener el último dato mostrado si no hay interacción
        legendElement.innerHTML = lastValidData;
        //tooltip.style.display = 'none'; // Ocultar si no hay datos
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
    const ratioData = param.seriesData.get(divisionSeries); 
    const volumeData = param.seriesData.get(volumeSeries);
    let totalVolume = 0; // Para almacenar volumen total en caso de comparar

    // Manejar solo los datos del ratio
    if (ratioData) {
        const ratioValue = ratioData.close; // Cierre del ratio

        // Actualizar el historial del ratio
        updateRatioInHistory(param.time, ratioValue);

        // Para el volumen
        const volumeValue = volumeData ? volumeData.value : 0;
        totalVolume += volumeValue; // Sumar el volumen al total

        let percentageChange = '';
        

        // Preparar el contenido de la leyenda
        const ratioLegendContent = `
            <strong>Fecha:</strong> ${formatDate(param.time)} <br>
            <strong>Ratio Cierre:</strong> ${ratioValue.toFixed(3)} <br>
            <strong>Volumen Total:</strong> ${(totalVolume / 1000000).toFixed(2)}M <br>
            ${percentageChange}
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
            <strong>Cierre:</strong> ${price.close.toFixed(2)}<br>
            <strong>Volumen:</strong> ${volumeData ? formatVolume(volumeData.value) : 'N/A'}<br>`;
        
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
    const input = event.target.value.toUpperCase(); // Usa const o let para variables locales

});

//Aca gestionar todo lo de la lista de instrumentos
// Solicitar la lista de instrumentos

fetch('/docs')
    .then(response => response.json())
    .then(data => {
        instruments = data; // Guarda los instrumentos globalmente
        const instrumentList = document.getElementById('instrument-list');
        
        // Limpiar la lista existente antes de cargar nuevos instrumentos
        instrumentList.innerHTML = ''; // Limpia los elementos anteriores

        data.forEach(instrument => {
            const listItem = document.createElement('li');
            const button = document.createElement('button');
            button.textContent = instrument;
            button.onclick = () => {
                selectedInstrument = instrument; // Almacena el instrumento seleccionado globalmente
                loadChartData(selectedInstrument); // Carga los datos del gráfico
                fetchAndUpdateChartData(selectedInstrument); // Actualiza el gráfico inmediatamente
                
                document.getElementById('instrument-title').textContent = `Análisis de ${selectedInstrument}`;
            };
            listItem.appendChild(button);
            instrumentList.appendChild(listItem);
        });

        // Establece el primer instrumento como el seleccionado por defecto, si hay alguno
        if (instruments.length > 0) {
            selectedInstrument = instruments[0]; // Asigna el primer instrumento como seleccionado por defecto
            loadChartData(selectedInstrument); // Cargar datos del gráfico para el primer instrumento
            fetchAndUpdateChartData(selectedInstrument); // Actualizar el gráfico para el primer instrumento
            document.getElementById('instrument-title').textContent = `Análisis de ${selectedInstrument}`;
        }

        document.getElementById('search-input').value = ''; // Limpiar el campo de búsqueda

    })
    .catch(error => console.error('Error al cargar la lista de instrumentos:', error));

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

function loadChartData(input) {
    // Limpiar datos previos del gráfico
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

    // Mantener el estado del botón de bandas de Bollinger
    document.getElementById('toggle-bands').textContent = bandsVisible ? 'Ocultar Bandas de Bollinger' : 'Mostrar Bandas de Bollinger';

    const inputUpperCase = input.toUpperCase(); // Convertir la entrada a mayúsculas

    // Actualizar el título del gráfico
    document.getElementById('instrument-title').textContent = `Análisis de ${inputUpperCase}`;
    console.log(`Instrumento actual: ${inputUpperCase}`); // Verifica el valor

    // Verificar si el input es un ratio
    if (inputUpperCase && inputUpperCase.includes('/')) {
        // Si es un ratio, llamar a la función que procesa el ratio

        fetchAndUpdateChartDataRatio(inputUpperCase);
    } else {
        // Si no es un ratio, cargar los datos del símbolo individual
        fetchAndUpdateChartData(inputUpperCase);
    }

    document.getElementById('search-input').value = ''; // Limpiar el campo de entrada

    // Si el usuario ha marcado la opción de "Mostrar bandas de Bollinger", mostramos las bandas automáticamente
    if (bandsVisible) {
        const { bands, movingAverage } = calculateBollingerBands(filteredResults.map(result => ({
            fecha: result.time,
            cierre: result.value
        })));
        upperBandData = bands.map(b => ({ time: b.time, value: b.upper }));
        lowerBandData = bands.map(b => ({ time: b.time, value: b.lower }));
        movingAverageData = movingAverage;
        upperBandSeries.setData(upperBandData);
        lowerBandSeries.setData(lowerBandData);
        movingAverageSeries.setData(movingAverageData);
    }
}


document.getElementById('search-input').addEventListener('keydown', function(e) {
    const suggestions = document.getElementById('suggestions');
    const suggestionDivs = suggestions.querySelectorAll('div');
    const searchInput = document.getElementById('search-input');

    // Actualizar currentInput en cada tecla para reflejar el texto que el usuario está escribiendo
    if (!firstSuggestionConfirmed) {

        currentInput = searchInput.value;
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);

    }


      // Limpiar el input si el usuario presiona Backspace o Delete
    if (e.key === 'Backspace' || e.key === 'Delete'|| e.key === 'Enter') {
        highlightedIndex = -1; // Reiniciar la selección de sugerencias
        firstSuggestionConfirmed = false; // Reiniciar la confirmación de la primera parte
        currentInput = searchInput.value; // Actualizar el currentInput para reflejar lo que queda
    }


    if (e.key === 'ArrowDown') {

        // Navegar hacia abajo por las sugerencias
        if (highlightedIndex < suggestionDivs.length - 1) {
            highlightedIndex++;
            highlightSuggestion(suggestions, highlightedIndex);
            const selectedText = suggestionDivs[highlightedIndex].innerText;

            if (!firstSuggestionConfirmed) {
                // Si aún no se ha confirmado la primera sugerencia
                currentInput = selectedText;
                searchInput.value = currentInput; // Actualizar el campo con la sugerencia seleccionada
            } else {
                // Si ya se confirmó la primera sugerencia, modificar la segunda parte después de "/"
                const parts = searchInput.value.split('/');
                currentInput = parts[0] + '/' + selectedText; // Actualizar la parte después de "/"
                searchInput.value = currentInput; // Mostrar el valor actualizado en el campo de búsqueda
            }

        }
    

    } else if (e.key === 'ArrowUp') {

        // Navegar hacia arriba por las sugerencias
        if (highlightedIndex > 0) {
            highlightedIndex--;
            highlightSuggestion(suggestions, highlightedIndex);
            const selectedText = suggestionDivs[highlightedIndex].innerText;

            if (!firstSuggestionConfirmed) {
                currentInput = selectedText;
                searchInput.value = currentInput; // Actualizar el campo con la sugerencia seleccionada
            } else {
                const parts = searchInput.value.split('/');
                currentInput = parts[0] + '/' + selectedText; // Actualizar la parte después de "/"
                searchInput.value = currentInput; // Mostrar el valor actualizado en el campo de búsqueda
            }

        }


    } else if (e.key === '/') {
        // Confirmar la primera sugerencia y agregar "/"
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);

            if (!firstSuggestionConfirmed) {
                firstSuggestionConfirmed = true;
                searchInput.value = currentInput; // Mostrar el valor actualizado en el campo de búsqueda
                highlightedIndex = -1; // Reiniciar la selección de sugerencias
                showSuggestions(''); // Actualizar las sugerencias para la segunda parte

            }


    } else if (e.key === 'Enter') {
        // Prevenir el envío del formulario
        e.preventDefault(); 
        const input = document.getElementById('search-input').value.trim().toUpperCase();

        // Limpiar las sugerencias antes de procesar
        suggestions.innerHTML = ''; // Limpia las sugerencias anteriores
        suggestions.style.display = 'none'; // Ocultar las sugerencias

        // Verificar si hay sugerencias seleccionadas
        if (highlightedIndex >= 0 && suggestionDivs.length > 0) { // Asegúrate de que haya sugerencias
            selectedInstrument = suggestionDivs[highlightedIndex].textContent.trim(); // Actualiza la variable global
            document.getElementById('search-input').value = selectedInstrument; // Establecer el input con la selección
        } else {
            // Limpiar el campo de entrada si no hay selección
            document.getElementById('search-input').value = ''; 
        }

        // Verificar si es un par de símbolos separados por "/"
        if (input.includes('/')) {
            const [symbol1, symbol2] = input.split('/').map(s => s.trim());

            // Verificar que ambos símbolos existan en la lista de instrumentos
            if (instruments.includes(symbol1) && instruments.includes(symbol2)) {
                selectedInstrument = `${symbol1}/${symbol2}`; // Actualiza la variable global
                loadChartData(selectedInstrument); // Cargar el gráfico del instrumento seleccionado
            } else {
                console.error('Uno o ambos símbolos no existen en la lista de instrumentos.');
            }
            
        } else {
            // Si es un solo símbolo, cargar sus datos normalmente
            selectedInstrument = input;

            // Verificar si el símbolo existe antes de cargar datos
            if (instruments.includes(selectedInstrument)) {
                loadChartData(selectedInstrument);
            } else {
                console.error('El símbolo no existe en la lista de instrumentos.');
            }
        }

        // Reiniciar el índice destacado tras la selección
        highlightedIndex = -1; 
    
        
    } else if (e.key === 'Escape') {
        // Cerrar las sugerencias al presionar "Escape"
        suggestions.style.display = 'none';
        tooltip.style.display = 'none';
        suggestions.innerHTML = ''; // Limpiar contenido de sugerencias
        highlightedIndex = -1; // Reiniciar el índice destacado
    }
    
});


function filterInstruments() {
    const input = document.getElementById('search-input').value.toUpperCase();
    const suggestions = document.getElementById('suggestions');
    suggestions.innerHTML = ''; // Limpiar las sugerencias
    highlightedIndex = -1; // Reiniciar el índice destacado

    // Dividir el input si contiene un "/"
    const inputs = input.includes('/') ? input.split('/').map(s => s.trim()) : [input];

    // Si hay una barra '/', filtra el primer símbolo y muestra todos los demás
    if (inputs.length > 1) {
        const firstSymbol = inputs[0]; // Símbolo antes de "/"
        const secondSymbol = inputs[1]; // Símbolo después de "/"
        
        // Filtrar todos los instrumentos que contienen el primer símbolo
        const filteredInstruments = instruments.filter(instrument => 
            instrument.toUpperCase().includes(firstSymbol) || 
            instrument.toUpperCase().includes(secondSymbol)
        );

        if (filteredInstruments.length > 0) {
            suggestions.style.display = 'block';
            filteredInstruments.forEach((instrument, index) => {
                const suggestionDiv = document.createElement('div');
                suggestionDiv.textContent = instrument;
                suggestionDiv.tabIndex = 0; // Hacer que la sugerencia sea enfocada
                suggestionDiv.onclick = () => {
                    document.getElementById('search-input').value = instrument;
                    loadChartData(instrument);
                    suggestions.style.display = 'none'; // Ocultar las sugerencias
                };
                suggestionDiv.onmouseover = () => {
                    highlightedIndex = index; // Resaltar el índice al pasar el mouse
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
        // Filtrar normalmente si no hay "/"
        const filteredInstruments = instruments.filter(instrument => 
            instrument.toUpperCase().includes(input)
        );

        if (filteredInstruments.length > 0) {
            suggestions.style.display = 'block';
            filteredInstruments.forEach((instrument, index) => {
                const suggestionDiv = document.createElement('div');
                suggestionDiv.textContent = instrument;
                suggestionDiv.tabIndex = 0; // Hacer que la sugerencia sea enfocada
                suggestionDiv.onclick = () => {
                    document.getElementById('search-input').value = instrument;
                    loadChartData(instrument);
                    suggestions.style.display = 'none'; // Ocultar las sugerencias
                };
                suggestionDiv.onmouseover = () => {
                    highlightedIndex = index; // Resaltar el índice al pasar el mouse
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



setInterval(() => {
    
    const inputUpperCase = selectedInstrument.toUpperCase(); // Convertir la entrada a mayúsculas


    if (selectedInstrument && !selectedInstrument.includes('/')) { // Comprueba que hay un solo símbolo seleccionado
        fetchAndUpdateChartData(selectedInstrument); // Llama a la función con el símbolo seleccionado
    
    } else if (inputUpperCase && inputUpperCase.includes('/')) {

        const [symbol1, symbol2] = inputUpperCase.split('/').map(s => s.toUpperCase());
        

        // Verificar si ambos símbolos existen en la lista de instrumentos
        if (instruments.includes(symbol1) && instruments.includes(symbol2)) {

            if (!symbol1 || !symbol2) {
                console.error('Ambos símbolos deben estar definidos antes de hacer la solicitud.');
                return; // Detener ejecución si hay un símbolo indefinido
            }
            
            fetchAndUpdateChartDataRatio(symbol1, symbol2);
               

        } else {
            console.error(`${symbol1}/${symbol2} no existe en la lista de instrumentos.`);
        }


    }
}, 1000);

