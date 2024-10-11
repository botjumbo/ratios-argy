const csvFiles = ['AL30.CSV', 'AL30D.CSV', /* otros archivos */];

const promises = csvFiles.map(file => loadCSV(`docs/proyect1/${file}`));
Promise.all(promises)
    .then(instrumentsData => {
        instruments = instrumentsData.flat(); // Combina todos los resultados en un solo array
        populateInstrumentList(); // Llama a la función para poblar la lista
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

