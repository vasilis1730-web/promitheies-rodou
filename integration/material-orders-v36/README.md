# Ενοποίηση «Δελτίο Υλικού» — v36

Ο φάκελος αυτός περιέχει τα αναπαραγώγιμα patches και τη migration για την ενσωμάτωση της εφαρμογής «Εντολές / Δελτία Υλικών» στην εφαρμογή «Προμήθειες Δήμου Ρόδου».

Η ροή παραγωγής:

1. Επαληθεύει τα ακριβή source blob SHA των δύο εφαρμογών.
2. Εφαρμόζει το patch στο `index.html` της εφαρμογής προμηθειών.
3. Κατεβάζει το ακριβές `index.html` της εφαρμογής `deltia---Ylikou` και δημιουργεί το `material-orders.html`.
4. Προσθέτει τη migration `material_orders_integration_v36.sql`.
5. Ελέγχει τη σύνταξη JavaScript και τα βασικά σημεία της ενοποίησης.
6. Κάνει commit των παραγόμενων αρχείων στον κλάδο `feature/material-vouchers-integration`.

Η SQL migration πρέπει να εκτελεστεί στο Supabase πριν από δοκιμή παραγωγής. Δεν εκτελείται από το GitHub Actions workflow.
