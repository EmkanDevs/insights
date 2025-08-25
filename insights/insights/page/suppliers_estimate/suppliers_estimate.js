
frappe.pages['suppliers-estimate'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Suppliers for Estimation Needs',
        single_column: true
    });

    page.add_inner_button(__('Print Table'), function() {
        let table = document.querySelector('.supplier-insights-table');
        if (!table) {
            frappe.msgprint("No data to print");
            return;
        }
        let clone = table.cloneNode(true);

        // Remove all elements with class "details-btn"
        clone.querySelectorAll('.details-btn').forEach(btn => btn.remove());
    
        // Also remove the header cell if it exists
        clone.querySelectorAll('th, td').forEach(cell => {
            if (cell.textContent.trim() === "Details" || cell.querySelector('.details-btn')) {
                cell.remove();
            }
        });

        let print_window = window.open('', '', 'height=700,width=900');

        print_window.document.write(`
            <html>
            <head>
                <title>Suppliers for Estimation Needs</title>
                <style>
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                    }
                    table, th, td {
                        border: 1px solid #000;
                    }
                    th, td {
                        padding: 6px;
                        text-align: left;
                    }
                    th {
                        background: #f2f2f2;
                    }
                </style>
            </head>
            <body>
                ${clone.outerHTML}
            </body>
            </html>
        `);

        print_window.document.close();
        print_window.focus();
        print_window.print();
    });

    page.add_inner_button(__('Export to Excel'), function() {
        let table = document.querySelector('.supplier-insights-table table');
        if (!table) {
            frappe.msgprint("No data to export");
            return;
        }
    
        let cloned = table.cloneNode(true);
    
        let detailsColIndex = -1;
        let headerCells = cloned.querySelectorAll("thead th, tr:first-child th");
        headerCells.forEach((th, i) => {
            if (th.innerText.trim().toLowerCase() === "details") {
                detailsColIndex = i;
            }
        });
    
        if (detailsColIndex > -1) {
            cloned.querySelectorAll("tr").forEach(tr => {
                let cells = tr.querySelectorAll("th, td");
                if (cells[detailsColIndex]) {
                    cells[detailsColIndex].remove();
                }
            });
        }
    
        cloned.querySelectorAll(".details-btn").forEach(btn => btn.remove());
    
        let csv = [];
        let rows = cloned.querySelectorAll("tr");
    
        rows.forEach(tr => {
            let row = [];
            let cols = tr.querySelectorAll("th, td");
            cols.forEach(td => {
                let htmlContent = td.innerHTML.replace(/<br\s*\/?>/gi, "\n");
                let text = (new DOMParser().parseFromString(htmlContent, "text/html")).body.textContent;
                text = text
                    .split("\n")
                    .map(line => line.trim()) 
                    .filter(line => line.length > 0)
                    .join("\n");
    
                row.push('"' + text.replace(/"/g, '""') + '"');
            });
            csv.push(row.join(","));
        });
    
        let blob = new Blob(["\ufeff" + csv.join("\n")], { type: "text/csv;charset=utf-8;" });
        let link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "Suppliers_Estimate.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });    
    
    page.set_primary_action('Generate Report', function() {
        fetch_supplier_estimate(filters);
    });
    $(`<style>
        .dt-cell__content {
            text-align: left !important;
        }</style>
    `).appendTo(page.main);	

	let supplierParam = '';

	if (frappe.route_options && frappe.route_options.supplier) {
		supplierParam = frappe.route_options.supplier[0];
		frappe.route_options = null;
	} else {
		const urlParams = new URLSearchParams(window.location.search);
		supplierParam = urlParams.get('supplier');
	}

    let filters = {
        "supplier":[],
        "has_po_only":0,
        "has_sq_only":0
    };

    this.page = page;
    $(page.main).on("click", ".details-btn", function (e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Details button clicked!", this);
        let supplier_code = $(this).data("supplier");
        let doctype_name = $(this).data("doctype");
        let details = $(this).data("details");
        let supplier_name = $(this).data("supplier_name");
        let items = $(this).data("items");
        open_purchase_details(supplier_code, supplier_name, doctype_name, details, items);
    });
    this.form = new frappe.ui.FieldGroup({
        fields: [
            {
                fieldtype: 'MultiSelectList',
                label: 'Supplier',
                fieldname: 'supplier',
                options: "Supplier",
                get_data: function (txt) {
                    return frappe.db.get_link_options("Supplier", txt);
                },
                onchange: function() {
                    filters.supplier = this.values || [];
                }
            },
            {
                fieldtype: 'Column Break',
            },
            {
                fieldtype: 'Link',
                label: 'Supplier Group',
                fieldname: 'supplier_group',
                options: 'Supplier Group',
                onchange: function() {
                    filters.supplier_group = this.value || null;
					filters.supplier = []
                }
            },
			{
                fieldtype: 'Column Break',
            },
            {
                fieldtype: 'Data',
                label: 'Section, Materials, Services',
                fieldname: 'custom_section_materials_services',
                onchange: function() {
                    filters.custom_section_materials_services = this.value || null;
					filters.supplier = []
                }
            },
			{
                fieldtype: 'Column Break',
            },
            {
                fieldtype: 'MultiSelectList',
                label: 'Project',
                fieldname: 'project',
                options: 'Project',
                get_data: function (txt) {
                    return frappe.db.get_link_options("Project", txt);
                },
                onchange: function() {
                    filters.project = this.values || null;
					filters.supplier = []
                }
            },
			{
                fieldtype: 'Section Break',
            },
            {
                fieldtype: 'MultiSelectList',
                label: 'Item',
                fieldname: 'item',
				options: 'Item',
                get_data: function (txt) {
                    return frappe.db.get_link_options("Item", txt);
                },
                onchange: function() {
                    filters.item = this.values || null;
					filters.supplier = []
                }
            },
			{
                fieldtype: 'Column Break',
            },
            {
                fieldtype: 'Link',
                label: 'Item Group',
                fieldname: 'item_group',
				options: 'Item Group',
                onchange: function() {
                    filters.item_group = this.value || null;
					filters.supplier = []
                }
            },
            {
                fieldtype: 'Column Break',
            },
            {
                fieldtype: 'Select',
                label: 'Date Range',
                fieldname: 'date_range',
                default: 'Last Week',
                options: ['Last Week', 'Last Month', 'Last 3 Months', 'Last Year', 'Select Date Range'],
                onchange: function() {
                    filters.date_range = this.value || null;
					filters.supplier = []
                }
            },
            {
                fieldtype: 'Column Break',
            },
            {
                label: 'Select Date Range',
                fieldtype: 'Date Range',
                fieldname: 'selected_date_range',
                depends_on: "eval:doc.date_range == 'Select Date Range'",
                default: [frappe.datetime.month_start(), frappe.datetime.now_date()],
                onchange: function() {
                    filters.selected_date_range = this.value || null;
					filters.supplier = []
                }
            },
            {
                fieldtype: 'Section Break',
            },
            {
                fieldtype: 'Check',
                label: 'Only Suppliers with Purchase Orders',
                fieldname: 'has_po_only',
                default: 0,
                onchange: function() {
                    filters.has_po_only = this.value ? 1 : 0;
                    filters.supplier = []
                }
            },
            {
                fieldtype: 'Column Break',
            },
            {
                fieldtype: 'Check',
                label: 'Only Suppliers with Supplier Quotation',
                fieldname: 'has_sq_only',
                default: 0,
                onchange: function() {
                    filters.has_sq_only = this.value ? 1 : 0;
                    filters.supplier = []
                }
            }
        ],
        body: this.page.body,
    });
    this.form.make();

	setTimeout(() => {
		const supplierField = this.form.get_field('supplier');
		if (supplierField && supplierField.df.fieldtype === 'MultiSelectList') {
			supplierField.set_value([supplierParam]);
			supplierField.refresh();
		}
	}, 500); 

    let table_container = $("<div class='supplier-insights-table mt-3'></div>").appendTo(page.main);

    let data_table = new frappe.DataTable(table_container[0], {
        columns: [
            { name: "Supplier", width: 225, fieldtype: "Data", editable: false },
            { name: "Purchase Order", width: 200, fieldtype: "Data", editable: false },
            // { name: "Project", width: 300, fieldtype: "Data", editable: false },
        ],
        data: [],
        cellHeight: 200,
        inlineFilters: false,
        noDataMessage: "No records found",
    });

    function fetch_supplier_estimate(filters) {
        frappe.call({
            method: 'insights.insights.page.suppliers_estimate.suppliers_estimate.get_supplier_estimate',
            args: { filters },
            freeze: true,
            freeze_message: 'Fetching supplier details...',
            callback: function(r) {
                if (r.message) {
                    update_table(r.message);
                    frappe.dom.unfreeze();
                }
            }
        });
    }

    function update_table(data) {
        let table_html = `
            <table class="table table-bordered">
                <thead>
                    <tr>
                        <th>Supplier</th>
                        <th>Supplier Quotation</th>
                        <th>Purchase Order</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            <td>
                                <strong>Supplier Code:</strong> ${row.supplier_code || ''}<br>
                                <strong>Supplier Name:</strong> ${row.supplier_name || ''}<br>
                                <strong>Section, Materials, Services:</strong> ${row.section_materials_services || ''}<br>
                                <strong>Address:</strong> ${row.address || 'NA'}<br>
                                <strong>Contact:</strong> ${row.contact || 'NA'}
                            </td>
                            <td>
                                ${row.supplier_quotation
                                    ? `Total Records: ${row.supplier_quotation.total_records || 0}<br>
                                    Total Quoted Qty: ${row.supplier_quotation.total_qty || 0} Qty<br>
                                    <button type="button" class="btn btn-secondary details-btn" 
                                        data-supplier="${row.supplier_code}" 
                                        data-supplier_name="${row.supplier_name}"
                                        data-doctype="Supplier Quotation"
                                        data-items='${JSON.stringify(row.supplier_quotation_items)}'
                                        data-details='${JSON.stringify({ 
                                            total_records: row.supplier_quotation.total_records, 
                                            total_qty: row.supplier_quotation.total_qty 
                                        })}'>
                                        Details
                                    </button>`
                                    : ``
                                }
                            </td>
                            <td>
                                ${row.purchase_order
                                    ? `Total Records: ${row.purchase_order.total_records || 0}<br>
                                    Last PO date: ${row.purchase_order.last_po_date || 0}<br>
                                    Total Order Qty: ${row.purchase_order.total_qty || 0} Qty<br>
                                    <button type="button" class="btn btn-secondary details-btn" 
                                        data-supplier="${row.supplier_code}" 
                                        data-supplier_name="${row.supplier_name}"
                                        data-doctype="Purchase Order"
                                        data-items='${JSON.stringify(row.items)}'
                                        data-details='${JSON.stringify({ 
                                            total_records: row.purchase_order.total_records, 
                                            total_qty: row.purchase_order.total_qty 
                                        })}'>
                                        Details
                                    </button>`
                                    : ``
                                    // row.projects 
                                    //     ? `Total Projects: ${row.projects.total_records || 0}<br>
                                    //     All Projects: ${row.projects.all_projects || 0}<br>
                                    //     <button class="btn btn-secondary details-btn" 
                                    //         data-supplier="${row.supplier_code}" 
                                    // 		data-supplier_name="${row.supplier_name}"
                                    //         data-doctype="Project" 
                                    //         data-details='${JSON.stringify({ 
                                    //             total_records: row.projects.total_records, 
                                    //             all_projects: row.projects.all_projects
                                    //         })}'>
                                    //         Details
                                    //     </button>`
                                    //     : ``
                                    }
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        $(".supplier-insights-table").html(table_html);
    }

    function open_purchase_details(supplier_code, supplier_name, doctype_name, details, items) {
        let items_array = [];

        try {
            let parsed = JSON.parse(items);
            items_array = Array.isArray(parsed) ? parsed : JSON.parse(parsed);
        } catch (e) {
            console.error("Failed to parse items:", items, e);
        }
        let header_html = `
            <h5>Supplier Name - ${supplier_name}</h5>
            <h5>Supplier ID - ${supplier_code}</h5>
            <h5>Total ${doctype_name}: ${details?.total_records || 0}</h5>
            <h5>Total Order Qty: ${details?.total_qty || 0}</h5>
            <br>
            <h4>Item Details</h4>
        `;
        let items_html = "<table class='table table-sm table-bordered'><thead><tr><th>Item Code</th><th>Item Name</th><th>Qty</th></tr></thead><tbody>";

        items_array.forEach(row => {
            items_html += `<tr>
                <td>${row[1] || ''}</td>
                <td>${row[3] || ''}</td>
                <td>${row[2] || ''}</td>
            </tr>`;
        });

        items_html += "</tbody></table>";

        let d = new frappe.ui.Dialog({
            title: `${doctype_name} Details`,
            size: "large",
            fields: [{ fieldtype: "HTML", options: header_html + items_html }],
            primary_action_label: "Close",
            primary_action() { d.hide(); }
        });

        d.show();
        d.$wrapper.find('.modal-dialog').css("max-width", "1000px");
    }

    fetch_supplier_estimate(filters);
};

frappe.pages['suppliers-estimate'].on_page_show = function(wrapper) {
    if (frappe.route_options && frappe.route_options.supplier) {
        let supplierParam = frappe.route_options.supplier[0];
        frappe.route_options = null;
		filters = {};
        const supplierField = wrapper.form.get_field('supplier');
        if (supplierField && supplierField.df.fieldtype === 'MultiSelectList') {
            supplierField.set_value([supplierParam]);
            supplierField.refresh();
        }

        filters.supplier = [supplierParam];
        fetch_supplier_estimate(filters);
    }
};
