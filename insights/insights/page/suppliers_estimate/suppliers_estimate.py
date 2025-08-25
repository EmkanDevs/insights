import frappe
import json
from frappe.utils import nowdate, add_days
from datetime import datetime

@frappe.whitelist()
def get_supplier_estimate(filters):
    filters = json.loads(filters)

    date_ranges = {
        "Last Week": -7,
        "Last Month": -30,
        "Last 3 Months": -90,
        "Last Year": -365
    }

    if filters.get("date_range") == 'Select Date Range':
        start_date, end_date = filters.get("selected_date_range")
    else:
        start_date = add_days(nowdate(), date_ranges.get(filters.get("date_range"), -30))
        end_date = nowdate()
    supplier_filters = (
        {"custom_section_materials_services": ["like", "%" + filters.get("custom_section_materials_services") + "%"]}
        if filters.get("custom_section_materials_services") else {}
    )
    if filters.get("supplier_group"):
        supplier_filters["supplier_group"] = filters.get("supplier_group")
    if filters.get("supplier"):
        supplier_filters["name"] = ["in", filters.get("supplier")]
    items_list = []
    if filters.get("item"):
        items_list = filters.get("item")
    if filters.get("item_group"):
        items = frappe.get_all(
            "Item",
            filters={"item_group": filters.get("item_group")},
            pluck="name"
        )
        if items_list:
            items_list = list(set(items) & set(items_list))
        else:
            items_list.extend(items)
    suppliers = frappe.db.get_values("Supplier", supplier_filters, ["name", "supplier_name", "supplier_primary_contact", "primary_address", "custom_section_materials_services"])
    results = []
    project_dict = []
    for supplier in suppliers:
        supplier_name = supplier[1]
        supplier_quotation = list(frappe.db.get_values("Supplier Quotation", {"supplier_name" : supplier[1], "transaction_date" : ["between", [start_date, end_date]]}, ["name", "total_qty" ]))
        purchase_orders = list(frappe.db.get_values("Purchase Order", {"supplier_name" : supplier[1], "transaction_date" : ["between", [start_date, end_date]]}, ["name", "total_qty", "schedule_date"]))
        filtered_orders = []
        filtered_quotations_sq = []
        item_results = []
        sq_item_results = []
        total_qty = 0
        supplier_quotation_qty = 0
        for j in supplier_quotation:
            items = frappe.db.get_values("Supplier Quotation Item", {"parent": j[0]}, ["project", "item_code", "qty", "item_name"])
            for p in items:
                supplier_quotation_qty = supplier_quotation_qty + p[2]
                sq_item_results.append(list(p))
                if j not in filtered_quotations_sq:
                    filtered_quotations_sq.append(j)
        supplier_quotation = filtered_quotations_sq
        if len(supplier_quotation) > 0:
            sq_result = {
                "total_records": len(supplier_quotation),
                "total_qty": supplier_quotation_qty
            }
        else:
            sq_result = None
        for j in purchase_orders:
            items = frappe.db.get_values("Purchase Order Item", {"parent": j[0]}, ["project", "item_code", "qty", "item_name"])
            for p in items:
                if filters.get("project") and p[0] not in filters.get("project"):
                    continue
                if filters.get("item") and p[1] not in items_list:
                    continue
                if filters.get("item_group") and p[1] not in items_list:
                    continue
                total_qty = total_qty + p[2]
                item_results.append(list(p))
                if j not in filtered_orders:
                    filtered_orders.append(j)
        purchase_orders = filtered_orders
        if len(purchase_orders) > 0:
            total_records = len(purchase_orders)
            last_po_date = datetime.strptime(start_date, "%Y-%m-%d").date()
            for i in purchase_orders:
                items = frappe.db.get_values("Purchase Order Item", {"parent": i[0]}, ["project", "item_code"])
                for p in items:
                    if p[0] not in project_dict:
                        project_dict.append(p[0])
                if last_po_date < i[2]:
                    last_po_date = i[2]
            project_result = {
                "total_records": len(project_dict),
                "all_projects": project_dict
            }
            result = {
                "total_records": total_records,
                "total_qty": total_qty,
                "last_po_date": last_po_date,
            }
        else:
            result = None
            project_result = None
        contact_name = frappe.db.get_value("Contact", {"company_name": supplier[1]}, "name")
        contact_string = ""
        if contact_name:
            doc = frappe.get_doc("Contact", contact_name)
            if doc.email_ids:
                contact_string += ", ".join([i.email_id for i in doc.email_ids]) + "<br>"
            if doc.phone_nos:
                contact_string += ", ".join([i.phone for i in doc.phone_nos])
        if filters.get("has_sq_only") == 1 and filters.get("has_po_only") == 0 and len(supplier_quotation) > 0:
            results.append({
                "supplier_code": supplier[0],
                "supplier_name": supplier[1],
                "contact": contact_string,
                "address": supplier[3],
                "section_materials_services": supplier[4],
                "supplier_quotation":sq_result,
                "supplier_quotation_items": frappe.as_json(sq_item_results),
                "purchase_order": result,
                "projects": project_result,
                "items": frappe.as_json(item_results)
            })
        if filters.get("has_po_only") == 1 and filters.get("has_sq_only") == 0 and result:
            results.append({
                "supplier_code": supplier[0],
                "supplier_name": supplier[1],
                "contact": contact_string,
                "address": supplier[3],
                "section_materials_services": supplier[4],
                "supplier_quotation":sq_result,
                "supplier_quotation_items": frappe.as_json(sq_item_results),
                "purchase_order": result,
                "projects": project_result,
                "items": frappe.as_json(item_results)
            })
        if filters.get("has_po_only") == 0 and filters.get("has_sq_only") == 0:
            results.append({
                "supplier_code": supplier[0],
                "supplier_name": supplier[1],
                "contact": contact_string,
                "address": supplier[3],
                "section_materials_services": supplier[4],
                "supplier_quotation":sq_result,
                "supplier_quotation_items": frappe.as_json(sq_item_results),
                "purchase_order": result,
                "projects": project_result,
                "items": frappe.as_json(item_results)
            })
        if filters.get("has_po_only") == 1 and filters.get("has_sq_only") == 1 and len(supplier_quotation) > 0 and result:
            results.append({
                "supplier_code": supplier[0],
                "supplier_name": supplier[1],
                "contact": contact_string,
                "address": supplier[3],
                "section_materials_services": supplier[4],
                "supplier_quotation":sq_result,
                "supplier_quotation_items": frappe.as_json(sq_item_results),
                "purchase_order": result,
                "projects": project_result,
                "items": frappe.as_json(item_results)
            })
        result = {}
        project_result = {}
        project_dict = []
    return results


@frappe.whitelist()
def get_supplier_details(supplier_code, supplier_name, doctype, details, filters=None):
    # Fetching Doctype Details Based On Supplier And Doctype Wise
    filters = json.loads(filters)
    details = json.loads(details)

    # Date Range Logic
    date_ranges = {
        "Last Week": -7,
        "Last Month": -30,
        "Last 3 Months": -90,
        "Last Year": -365
    }
    
    if filters.get("date_range") == 'Select Date Range':
        start_date, end_date = filters.get("selected_date_range")
    else:
        start_date = add_days(nowdate(), date_ranges.get(filters.get("date_range"), -30))  # Default to Last Month if invalid
        end_date = nowdate()


    if doctype == "Purchase Order":
        return get_purchase_order_data(supplier_code, supplier_name, start_date, end_date, details)
    elif doctype == "Project":
        return get_project_data(supplier_code, supplier_name, start_date, end_date, details)


def get_purchase_order_data(supplier_code, supplier_name, start_date, end_date, details):
    # Fetching Purchase Order Details And Showcased In Table
    result = frappe.db.sql("""
        SELECT 
            poi.item_code,
            poi.item_name,
            SUM(poi.qty) AS total_qty, 
            SUM(poi.qty - poi.received_qty) AS pending_qty, 
            AVG(poi.rate) AS avg_rate, 
            SUM(poi.amount) AS total_amount
        FROM `tabPurchase Order Item` poi
        JOIN `tabPurchase Order` po ON poi.parent = po.name
        WHERE po.supplier = %s 
        AND po.transaction_date >= %s
        AND po.transaction_date <= %s
        GROUP BY poi.item_code
    """, (supplier_code, start_date, end_date), as_dict=True)

    html = f"""
        <h5>Supplier Name - {supplier_name}</h5>
        <h5>Supplier ID - {supplier_code}</h5>
        <h5>Total Purchase Order: {details.get('total_records')}</h5>
        <br>
        <h4>Item Details</h4>
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th width="10%">Qty</th>
                    <th width="10%">Pending Qty</th>
                </tr>
            </thead>
            <tbody>
    """

    pending_qty = 0
    total_qty = 0
    for item in result:
        html += f"""
            <tr>
                <td>{item.item_code}</td>
                <td>{item.item_name}</td>
                <td>{frappe.format_value(item.total_qty, "Float")}</td>
                <td>{frappe.format_value(item.pending_qty, "Float")}</td>
            </tr>
        """
        total_qty += item.total_qty
        pending_qty += item.pending_qty

    html += f"""
        <tr style="font-weight: bold;">
            <td>Total</td>
            <td></td>
            <td>{frappe.format_value(total_qty, "Float")}</td>
            <td>{frappe.format_value(pending_qty, "Float")}</td>
    """

    html += "</tbody></table>"

    return html

def get_project_data(supplier_code, supplier_name, start_date, end_date, details):
    # Fetching Purchase Invoice Details And Showcased In Table
    result = frappe.db.sql("""
            SELECT 
                pii.item_code,
                pii.item_name,
                SUM(pii.qty) AS total_qty,
                SUM(pii.rate) AS avg_rate,
                SUM(pii.amount) AS total_amount
            FROM `tabPurchase Invoice Item` pii
            JOIN `tabPurchase Invoice` pi ON pii.parent = pi.name
            WHERE pi.supplier=%s 
            AND pi.docstatus=1 
            AND pi.posting_date >= %s
            AND pi.posting_date <= %s
            GROUP BY pii.item_code
        """, (supplier_code, start_date, end_date), as_dict=True)

    html = f"""
        <h5>Supplier Name - {supplier_name}</h5>
        <h5>Supplier ID - {supplier_code}</h5>
        <h5>Total Projects: {details.get('total_records')}</h5>
        <br>
        <h4>Item Details</h4>
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th width="10%">Qty</th>
                    <th width="15%">Rate</th>
                    <th width="15%">Total Taxable Amount</th>
                </tr>
            </thead>
            <tbody>
    """

    total_amount = 0
    for item in result:
        html += f"""
            <tr>
                <td>{item.item_code}</td>
                <td>{item.item_name}</td>
                <td>{frappe.format_value(item.total_qty, "Float")}</td>
                <td>{frappe.format_value(item.avg_rate, "Currency")}</td>
                <td>{frappe.format_value(item.total_amount, "Currency")}</td>
            </tr>
        """
        total_amount += item.total_amount

    html += f"""
        <tr style="font-weight: bold;">
            <td>Total</td>
            <td></td>
            <td>{frappe.format_value(details.get('total_qty'), "Float")}</td>
            <td></td>
            <td>{frappe.format_value(total_amount, "Currency")}</td>
        </tr>
    """

    html += "</tbody></table>"

    return html


def get_payment_request_data(supplier_code, supplier_name, start_date, end_date, details):
    # Fetching Payment Request Details And Showcased In Table
    result = frappe.db.sql("""
        SELECT 
            pr.payment_request_type,
            pr.transaction_date, 
            pr.reference_doctype, 
            pr.reference_name,
            pr.grand_total
        FROM `tabPayment Request` pr
        WHERE
            pr.party_type='Supplier'
            AND pr.party=%s 
            AND pr.docstatus=1 
            AND pr.transaction_date >= %s 
            AND pr.transaction_date <= %s
    """, (supplier_code, start_date, end_date), as_dict=True)

    html = f"""
        <h5>Supplier Name - {supplier_name}</h5>
        <h5>Supplier ID - {supplier_code}</h5>
        <h5>Total Payment Request: {details.get('total_records')}</h5>
        <br>
        <h4>Item Details</h4>
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th>Payment Request Type</th>
                    <th>Transaction Date</th>
                    <th width="25%">Reference Doctype</th>
                    <th width="25%">Reference Name</th>
                    <th width="15%">Total Amount</th>
                </tr>
            </thead>
            <tbody>
    """

    total_amount = 0
    for item in result:
        html += f"""
            <tr>
                <td>{item.payment_request_type}</td>
                <td>{frappe.format_value(item.transaction_date, "Date")}</td>
                <td>{item.reference_doctype}</td>
                <td>{item.reference_name}</td>
                <td>{frappe.format_value(item.grand_total, "Currency")}</td>
            </tr>
        """
        total_amount += item.grand_total

    html += f"""
        <tr style="font-weight: bold;">
            <td>Total</td>
            <td></td>
            <td></td>
            <td></td>
            <td>{frappe.format_value(total_amount, "Currency")}</td>
        </tr>
    """

    html += "</tbody></table>"

    return html


def get_payment_entry_data(supplier_code, supplier_name, start_date, end_date, details):
    # Fetching Payment Entry Details And Showcased In Table
    result = frappe.db.sql("""
        SELECT 
            pe.payment_type,
            pe.posting_date,
            pe.mode_of_payment,
            pe.unallocated_amount,
            pe.paid_amount
        FROM `tabPayment Entry` pe
        WHERE
            pe.party_type='Supplier'
            AND pe.party=%s 
            AND pe.docstatus=1 
            AND pe.posting_date >= %s 
            AND pe.posting_date <= %s
    """, (supplier_code, start_date, end_date), as_dict=True)

    html = f"""
        <h5>Supplier Name - {supplier_name}</h5>
        <h5>Supplier ID - {supplier_code}</h5>
        <h5>Total Payment Entry: {details.get('total_records')}</h5>
        <br>
        <h4>Item Details</h4>
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th>Payment Type</th>
                    <th>Transaction Date</th>
                    <th width="20%">Mode of Payment</th>
                    <th width="20%">Unallocated Amount</th>
                    <th width="20%">Paid Amount</th>
                </tr>
            </thead>
            <tbody>
    """

    unllocated_amount = 0
    total_amount = 0
    for item in result:
        html += f"""
            <tr>
                <td>{item.payment_type}</td>
                <td>{frappe.format_value(item.posting_date, "Date")}</td>
                <td>{item.mode_of_payment}</td>
                <td>{frappe.format_value(item.unallocated_amount, "Currency")}</td>
                <td>{frappe.format_value(item.paid_amount, "Currency")}</td>
            </tr>
        """
        unllocated_amount += item.unallocated_amount
        total_amount += item.paid_amount

    html += f"""
        <tr style="font-weight: bold;">
            <td>Total</td>
            <td></td>
            <td></td>
            <td>{frappe.format_value(unllocated_amount, "Currency")}</td>
            <td>{frappe.format_value(total_amount, "Currency")}</td>
        </tr>
    """

    html += "</tbody></table>"

    return html