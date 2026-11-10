BEGIN { FS = "," }
NR > 1 { a[$3 " anc=" $5]++; if ($6 == "") { nf++; nfl = nfl " " $1 } if ($7 == 0) { nt++; zt = zt " " $1 } if ($5 != "yes") bad = bad " " $1 "(" $5 ")" }
END { for (k in a) print k, a[k]; print "no feat(<id>) commit on develop:", nf, nfl; print "zero test mentions:", nt, zt; print "commit not on develop:", bad }
