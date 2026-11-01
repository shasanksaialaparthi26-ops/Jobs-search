FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml pom.xml
COPY api-gateway/pom.xml api-gateway/pom.xml
COPY user-service/pom.xml user-service/pom.xml
COPY resume-service/pom.xml resume-service/pom.xml
COPY application-service/pom.xml application-service/pom.xml
COPY notification-service/pom.xml notification-service/pom.xml
RUN mvn -pl notification-service -am dependency:go-offline -B
COPY notification-service/src notification-service/src
RUN mvn -pl notification-service -am package -DskipTests -B

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/notification-service/target/notification-service-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
