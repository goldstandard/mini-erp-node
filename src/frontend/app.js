document.getElementById("loadBtn").addEventListener("click", loadCosts);

async function loadCosts() {
  const currency = document.getElementById("currencySelect").value;
  const productId = document.getElementById("filterProduct").value;
  const lineId = document.getElementById("filterLine").value;
  const country = document.getElementById("filterCountry").value;

  const params = new URLSearchParams({
    currency,
    productId,
    lineId,
    country
  });

  const res = await fetch(`/api/costs?${params.toString()}`);
  const data = await res.json();

  renderTable(data);
}

function renderTable(data) {
  const tbody = document.querySelector("#resultsTable tbody");
  tbody.innerHTML = "";

  data.forEach(item => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${item.productId}</td>
      <td>${item.lineId}</td>
      <td>${item.country}</td>
      <td>${item.materialCost.toFixed(4)}</td>
      <td>${item.processCost.toFixed(4)}</td>
      <td>${item.totalCost.toFixed(4)}</td>
      <td>${item.currency}</td>
    `;

    row.addEventListener("click", () => showDetails(item));

    tbody.appendChild(row);
  });
}

function showDetails(item) {
  const panel = document.getElementById("detailPanel");
  panel.style.display = "block";

  panel.innerHTML = `
    <h2>Details for Product ${item.productId} on Line ${item.lineId}</h2>
    <p><strong>Material cost:</strong> ${item.materialCost.toFixed(4)} ${item.currency}</p>
    <p><strong>Process cost:</strong> ${item.processCost.toFixed(4)} ${item.currency}</p>
    <p><strong>Total cost:</strong> ${item.totalCost.toFixed(4)} ${item.currency}</p>
    <p>(Material-level breakdown will be added later)</p>
  `;
}