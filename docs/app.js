const csvFiles = ['AL30.csv', 'AL30D.csv', /* otros archivos */];

const promises = csvFiles.map(file => loadCSV(`/ratios-argy/${file}`));
Promise.all(promises)
    .then(instrumentsData => {
        const instruments = instrumentsData.flat(); // Combina todos los resultados en un solo array
        populateInstrumentList(instruments); // Pasa los instrumentos a la función
    })
    .catch(error => {
        console.error('Error al cargar los instrumentos:', error);
    });

function loadCSV(file) {
    return fetch(file)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error al cargar ${file}`);
            }
            return response.text(); // O utiliza .json() si el contenido está en formato JSON
        })
        .then(csvText => {
            // Procesa el texto CSV aquí y conviértelo a un formato usable
            return Papa.parse(csvText, { header: true }).data; // Asumiendo que deseas convertirlo a un objeto
        });
}

function populateInstrumentList(instruments) {
    const instrumentList = document.getElementById('instrument-list');
    instrumentList.innerHTML = ''; // Limpiar la lista existente

    instruments.forEach(instrument => {
        const li = document.createElement('li');
        li.textContent = instrument.nombre; // Cambia 'nombre' por la propiedad correcta según tu CSV
        instrumentList.appendChild(li);
    });
}
