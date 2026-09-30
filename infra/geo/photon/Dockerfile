# Photon (komoot's OpenStreetMap search) from its release jar. The search
# index lives in the mounted /photon folder (get-photon.sh downloads it); the
# jar and the index must be the same Photon version family.
FROM eclipse-temurin:21-jre

ARG PHOTON_JAR_URL=https://github.com/komoot/photon/releases/download/0.6.2/photon-0.6.2.jar
ADD ${PHOTON_JAR_URL} /opt/photon.jar

WORKDIR /photon
EXPOSE 2322
ENV JAVA_OPTS="-Xmx12g"
CMD ["sh", "-c", "exec java $JAVA_OPTS -jar /opt/photon.jar -data-dir /photon -listen-ip 0.0.0.0 -listen-port 2322"]
